#!/usr/bin/env python3
# ── Déploiement Tournai Expert Immo — NAS Synology ───────────────
# Usage : python deploy.py
#         python deploy.py --backend-only
#         python deploy.py --frontend-only
#
# Chemin NAS : /volume1/docker/tournai-expert-immo
# Container  : tei-backend
# Docker-compose : /usr/local/bin/docker-compose

import paramiko
import subprocess
import sys
import os
import base64

NAS_HOST   = '10.0.0.10'
NAS_USER   = 'admin'
NAS_PASS   = 'Karmaa69'
REMOTE     = '/volume1/docker/tournai-expert-immo'
LOCAL_ROOT = os.path.dirname(os.path.abspath(__file__))
DC         = '/usr/local/bin/docker-compose'

def connect():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(NAS_HOST, username=NAS_USER, password=NAS_PASS)
    return ssh

def put(ssh, local_rel, remote):
    """Upload a file via base64-encoded SSH exec (no SFTP permission issues)."""
    local_path = os.path.join(LOCAL_ROOT, local_rel)
    if not os.path.exists(local_path):
        print(f'  - {os.path.basename(local_path)} (skipped — not found locally)')
        return
    with open(local_path, 'rb') as f:
        content = f.read()
    b64 = base64.b64encode(content).decode()
    cmd = f'echo {b64} | base64 -d > {remote}'
    _, out, err = ssh.exec_command(cmd)
    out.read()
    err_txt = err.read().decode().strip()
    if err_txt:
        print(f'  x {os.path.basename(local_path)}: {err_txt}')
    else:
        print(f'  + {os.path.basename(local_path)}')

def ssh_run(ssh, cmd, sudo=False):
    if sudo:
        cmd = f'echo {NAS_PASS} | sudo -S {cmd}'
    _, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    # Filter sudo password prompt from output
    err_clean = '\n'.join(l for l in err.splitlines() if not l.startswith('Password:'))
    if out: print('   ', out)
    if err_clean: print('   [err]', err_clean)

def deploy_backend(ssh):
    print('\n-- Backend --')
    files = [
        ('backend/db.js',          f'{REMOTE}/backend/db.js'),
        ('backend/server.js',      f'{REMOTE}/backend/server.js'),
        ('backend/mailer.js',      f'{REMOTE}/backend/mailer.js'),
        ('backend/calendar.js',    f'{REMOTE}/backend/calendar.js'),
        ('backend/gmail-trash.js', f'{REMOTE}/backend/gmail-trash.js'),
        ('backend/package.json',   f'{REMOTE}/backend/package.json'),
    ]
    for local, remote in files:
        put(ssh, local, remote)

def deploy_frontend(ssh):
    print('\n-- Frontend --')
    files = [
        ('frontend/booking.js',  f'{REMOTE}/frontend/booking.js'),
        ('frontend/booking.css', f'{REMOTE}/frontend/booking.css'),
        ('frontend/index.html',  f'{REMOTE}/frontend/index.html'),
    ]
    for local, remote in files:
        put(ssh, local, remote)

def deploy_nginx(ssh):
    print('\n-- Nginx --')
    put(ssh, 'nginx/conf.d/default.conf', f'{REMOTE}/nginx/conf.d/default.conf')

def restart_containers(ssh, restart_nginx=True):
    print('\n-- Restart --')
    print('  -> restart backend')
    ssh_run(ssh, f'{DC} -f {REMOTE}/docker-compose.yml restart backend 2>&1', sudo=True)
    if restart_nginx:
        print('  -> reload nginx')
        ssh_run(ssh, f'{DC} -f {REMOTE}/docker-compose.yml exec -T nginx nginx -s reload 2>&1', sudo=True)

def git_commit_push():
    """Commit tous les fichiers modifiés et push sur GitHub."""
    print('\n-- Git --')
    result = subprocess.run(
        ['git', 'status', '--porcelain'],
        cwd=LOCAL_ROOT, capture_output=True, text=True
    )
    if not result.stdout.strip():
        print('  Rien a committer.')
        return

    subprocess.run(['git', 'add', '-A'], cwd=LOCAL_ROOT, check=True)

    msg = input('  Message de commit (Entrée = "deploy"): ').strip() or 'deploy'
    subprocess.run(['git', 'commit', '-m', msg], cwd=LOCAL_ROOT, check=True)

    subprocess.run(['git', 'push', 'origin', 'master'], cwd=LOCAL_ROOT, check=True)
    print('  Push OK.')


def main():
    args = sys.argv[1:]
    backend_only  = '--backend-only'  in args
    frontend_only = '--frontend-only' in args
    skip_git      = '--no-git'        in args

    if not skip_git:
        git_commit_push()

    print('\n-- Connexion au NAS --')
    ssh = connect()
    print(f'  Connecte a {NAS_HOST}')

    if not frontend_only:
        deploy_backend(ssh)
    if not backend_only:
        deploy_frontend(ssh)
        deploy_nginx(ssh)

    restart_nginx = not backend_only
    restart_containers(ssh, restart_nginx=restart_nginx)

    ssh.close()
    print('\nDeploy OK.\n')

if __name__ == '__main__':
    main()
