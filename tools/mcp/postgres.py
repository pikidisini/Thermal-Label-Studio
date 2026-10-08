"""Bounded PostgreSQL inspection; no caller-supplied SQL or storage setup."""
from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
import json
import os
import re

import psycopg
from psycopg import sql


class InspectionError(Exception):
    """Safe error message for the MCP client."""


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    database: str
    user: str
    password: str
    schema: str = "label_studio"

    @classmethod
    def from_env(cls):
        required = ("TLS_MCP_DB_NAME", "TLS_MCP_DB_USER", "TLS_MCP_DB_PASSWORD")
        if any(not os.environ.get(key) for key in required):
            raise InspectionError("Set TLS_MCP_DB_NAME, TLS_MCP_DB_USER and TLS_MCP_DB_PASSWORD locally.")
        schema = os.environ.get("TLS_MCP_DB_SCHEMA", "label_studio")
        if not re.fullmatch(r"[a-z_][a-z0-9_]{0,62}", schema) or schema.startswith("pg_") or schema == "information_schema":
            raise InspectionError("Configure one application schema, not a system schema.")
        try:
            port = int(os.environ.get("TLS_MCP_DB_PORT", "5434"))
            if not 1 <= port <= 65535:
                raise ValueError
        except ValueError:
            raise InspectionError("TLS_MCP_DB_PORT must be between 1 and 65535.") from None
        return cls(os.environ.get("TLS_MCP_DB_HOST", "127.0.0.1"), port,
                   os.environ[required[0]], os.environ[required[1]],
                   os.environ[required[2]], schema)


class Inspector:
    def __init__(self, settings: Settings, connect=psycopg.connect):
        self.settings = settings
        self.connect = connect

    @contextmanager
    def session(self):
        s = self.settings
        try:
            with self.connect(host=s.host, port=s.port, dbname=s.database,
                              user=s.user, password=s.password, connect_timeout=5,
                              application_name="thermal-label-mcp",
                              options="-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=10000") as conn:
                with conn.cursor() as cur:
                    cur.execute("SET TRANSACTION READ ONLY")
                    cur.execute("SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = current_user")
                    flags = cur.fetchone()
                    if flags is None or any(flags):
                        raise InspectionError("Use a dedicated unprivileged read-only database role.")
                    cur.execute("SELECT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = (SELECT oid FROM pg_roles WHERE rolname = current_user))")
                    if cur.fetchone()[0]:
                        raise InspectionError("The MCP role must have no role memberships.")
                    cur.execute("""SELECT EXISTS (
                        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE n.nspname = %s AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
                        AND (c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
                        OR CASE WHEN c.relkind <> 'S' THEN
                            has_table_privilege(c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                            OR has_any_column_privilege(c.oid, 'INSERT,UPDATE,REFERENCES')
                            ELSE false END)
                    ) OR has_schema_privilege(%s, 'CREATE')""", (s.schema, s.schema))
                    if cur.fetchone()[0]:
                        raise InspectionError("The MCP role must not own application objects or have schema/table write privileges.")
                    yield cur
        except psycopg.Error:
            # Driver errors can contain connection credentials or business values.
            raise InspectionError("PostgreSQL inspection failed. Check local configuration, role grants and database availability.") from None

    def list_tables(self):
        with self.session() as cur:
            cur.execute("""SELECT c.relname FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = %s AND c.relkind IN ('r', 'p')
                AND has_table_privilege(c.oid, 'SELECT') ORDER BY c.relname LIMIT 201""", (self.settings.schema,))
            rows = cur.fetchall()
            return {"schema": self.settings.schema, "tables": [r[0] for r in rows[:200]], "truncated": len(rows) > 200}

    def _columns(self, cur, table):
        if not isinstance(table, str) or not table or len(table) > 63:
            raise InspectionError("Provide a table name returned by list_tables.")
        cur.execute("""SELECT a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull
            FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = %s AND c.relname = %s AND c.relkind IN ('r', 'p')
            AND a.attnum > 0 AND NOT a.attisdropped AND has_table_privilege(c.oid, 'SELECT')
            ORDER BY a.attnum""", (self.settings.schema, table))
        columns = cur.fetchall()
        if not columns:
            raise InspectionError("Table is unavailable in the configured schema or SELECT is not granted.")
        return columns

    def describe_table(self, table):
        with self.session() as cur:
            columns = self._columns(cur, table)
            cur.execute("""SELECT con.conname, pg_get_constraintdef(con.oid)
                FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = %s AND c.relname = %s ORDER BY con.conname""", (self.settings.schema, table))
            return {"schema": self.settings.schema, "table": table,
                    "columns": [{"name": name, "type": kind, "nullable": not required} for name, kind, required in columns],
                    "constraints": [{"name": name, "definition": definition} for name, definition in cur.fetchall()]}

    def read_table(self, table, columns, limit=25):
        if type(limit) is not int or not 1 <= limit <= 100:
            raise InspectionError("limit must be an integer between 1 and 100.")
        if not isinstance(columns, list) or not 1 <= len(columns) <= 20 or any(not isinstance(c, str) for c in columns) or len(set(columns)) != len(columns):
            raise InspectionError("Select between 1 and 20 distinct column names explicitly.")
        with self.session() as cur:
            available = {c[0] for c in self._columns(cur, table)}
            if any(c not in available for c in columns):
                raise InspectionError("Requested columns are unavailable.")
            query = sql.SQL("SELECT {} FROM {} LIMIT %s").format(
                sql.SQL(", ").join(sql.SQL("left({}::text, 4097)").format(sql.Identifier(c)) for c in columns),
                sql.Identifier(self.settings.schema, table))
            cur.execute(query, (limit + 1,))
            rows = cur.fetchmany(limit + 1)
            truncated_cells = []
            output = []
            for index, row in enumerate(rows[:limit]):
                values = []
                for column, value in zip(columns, row):
                    if value is not None and len(value) > 4096:
                        truncated_cells.append({"row": index, "column": column})
                        value = value[:4096]
                    values.append(value)
                output.append(values)
            result = {"schema": self.settings.schema, "table": table, "columns": columns,
                      "rows": output, "truncated": len(rows) > limit,
                      "truncated_cells": truncated_cells,
                      "value_format": "PostgreSQL text; SQL NULL is JSON null",
                      "ordering": "unspecified"}
            encoded = json.dumps(result, default=str, ensure_ascii=False)
            if len(encoded.encode("utf-8")) > 65536:
                raise InspectionError("Result exceeds 64 KiB. Select fewer columns or reduce limit.")
            return json.loads(encoded)
