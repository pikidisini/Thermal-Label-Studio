"""Bounded declarative SAP contracts; no executable mappings or network IO."""
from typing import Literal
import re
from pydantic import BaseModel, ConfigDict, Field, model_validator

NAME = r'^[A-Za-z_][A-Za-z0-9_]{0,29}$'
IDENTITY = r'^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
PATH = re.compile(r'^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$', re.ASCII)

class Model(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)

class Connection(Model):
    connection_id: str = Field(pattern=IDENTITY)
    name: str = Field(min_length=1, max_length=120)
    host: str = Field(min_length=1, max_length=253, pattern=r'^[A-Za-z0-9][A-Za-z0-9.:-]*$')
    system_number: str = Field(pattern=r'^[0-9]{2}$')
    client: str = Field(pattern=r'^[0-9]{3}$')
    username: str = Field(min_length=1, max_length=64)
    language: str = Field(default='EN', pattern=r'^[A-Z]{2}$')
    enabled: bool = False
    password_ciphertext: str | None = Field(default=None, max_length=2048, repr=False)

class Parameter(Model):
    name: str = Field(pattern=NAME)
    label: str = Field(min_length=1, max_length=80)
    kind: Literal['string', 'integer', 'decimal', 'date', 'boolean', 'string_list'] = 'string'
    required: bool = True
    source: Literal['operator', 'constant'] = 'operator'
    constant: str | None = Field(default=None, max_length=4096)

class Mapping(Model):
    source: str = Field(pattern=PATH, max_length=256)
    target: str = Field(min_length=1, max_length=128)
    required: bool = True

class Operation(Model):
    operation_id: str = Field(pattern=IDENTITY)
    name: str = Field(min_length=1, max_length=120)
    connection_id: str = Field(pattern=IDENTITY)
    function_name: str = Field(pattern=NAME)
    enabled: bool = False
    parameters: list[Parameter] = Field(default_factory=list, max_length=32)
    result_path: str = Field(default='', max_length=256)
    result_kind: Literal['structure', 'table'] = 'table'
    # Existing saved operations retain their explicit mapping behavior.
    response_mode: Literal['label_json', 'direct', 'mapping'] = 'mapping'
    json_path: str = Field(default='EV_JSON', pattern=PATH, max_length=256)
    status_path: str = Field(default='EV_STATUS', pattern=PATH, max_length=256)
    success_value: str = Field(default='S', min_length=1, max_length=16)
    message_path: str = Field(default='EV_MESSAGE', pattern=PATH, max_length=256)
    mappings: list[Mapping] = Field(default_factory=list, max_length=64)

    @model_validator(mode='after')
    def unique(self):
        if self.result_path and not re.fullmatch(PATH, self.result_path):
            raise ValueError('Result path must contain field names only.')
        if self.response_mode == 'mapping' and not self.mappings:
            raise ValueError('Manual mapping requires at least one field.')
        for names in ([p.name for p in self.parameters], [m.target for m in self.mappings]):
            if len(set(names)) != len(names):
                raise ValueError('Duplicate parameter or target field.')
        return self

class Configuration(Model):
    connections: list[Connection] = Field(default_factory=list, max_length=50)
    operations: list[Operation] = Field(default_factory=list, max_length=100)

    @model_validator(mode='after')
    def registry(self):
        ids = [c.connection_id for c in self.connections]
        operations = [o.operation_id for o in self.operations]
        if len(set(ids)) != len(ids) or len(set(operations)) != len(operations):
            raise ValueError('Duplicate SAP identity.')
        if any(o.connection_id not in ids for o in self.operations):
            raise ValueError('Unknown SAP connection.')
        return self
