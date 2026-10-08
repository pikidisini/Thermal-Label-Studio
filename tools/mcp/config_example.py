"""Print a Codex TOML block for this checkout without changing client settings."""
import argparse
import json
import shutil
from pathlib import Path
import sys

root = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--service', choices=('postgres', 'minio', 'jenkins', 'sonar'), default='postgres')
args = parser.parse_args()
entries = {'postgres': ('server.py', ['list_tables', 'describe_table', 'read_table']),
           'minio': ('minio_server.py', ['list_objects', 'stat_object', 'read_layout_svg']),
           'jenkins': ('jenkins_server.py', ['list_jobs', 'get_build_status', 'read_build_log']),
           'sonar': ('Start-SonarMcp.ps1', None)}
entry, tools = entries[args.service]
if args.service == 'sonar':
    executable = shutil.which('pwsh')
    if not executable:
        parser.error('PowerShell 7 (pwsh) is required for the SonarQube launcher.')
    launch_args = ['-NoProfile', '-File', (root / entry).as_posix()]
else:
    executable = sys.executable
    launch_args = ['-B', (root / entry).as_posix()]
print(f'[mcp_servers.thermal_label_{args.service}]')
print('command = ' + json.dumps(Path(executable).as_posix()))
print('args = ' + json.dumps(launch_args))
if tools is not None:
    print('enabled_tools = ' + json.dumps(tools))
print('startup_timeout_sec = ' + ('60' if args.service == 'sonar' else '15'))
print('tool_timeout_sec = ' + ('60' if args.service == 'sonar' else '30'))
