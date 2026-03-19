#!/usr/bin/env python3
# ── Déploiement Tournai Expert Immo — NAS Synology ───────────────
# Usage : python deploy.py
#         python deploy.py --backend-only
#         python deploy.py --frontend-only

import paramiko
import sys
import os

NAS_HOST = '10.0.0.10'
NAS_USER = 'admin'
NAS_PASS = 'Karmaa69'
REMOTE   = '/docker/tournai-expert-immo'

def connect():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(NAS_HOST, username=NAS_USER, password=NAS_PASS)
    return ssh

def put(sftp, local, remote):
    try:
        sftp.put(local, remote)
        print(f'  ✓ {os.path.basename(local)}')
    except Exception as e:
        print(f'  ✗ {os.path.basename(local)}: {e}')

def ssh_run(ssh, cmd):
    _, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if out: print('   ', out)
    if err: print('   [err]', err)

def deploy_backend(sftp):
    print('\n── Backend ──────────────────────────────')
    files = [
        ('backend/db.js',        f'{REMOTE}/backend/db.js'),
        ('backend/server.js',    f'{REMOTE}/backend/server.js'),
        ('backend/mailer.js',    f'{REMOTE}/backend/mailer.js'),
        ('backend/mollie.js',    f'{REMOTE}/backend/mollie.js'),
        ('backend/auth.js',      f'{REMOTE}/backend/auth.js'),
        ('backend/scheduler.js', f'{REMOTE}/backend/scheduler.js'),
        ('backend/package.json', f'{REMOTE}/backend/package.json'),
    ]
    for local, remote in files:
        put(sftp, local, remote)

def deploy_frontend(sftp, ssh):
    print('\n── Frontend ─────────────────────────────')
    files = [
        ('frontend/booking.js',          f'{REMOTE}/frontend/booking.js'),
        ('frontend/index.html',          f'{REMOTE}/frontend/index.html'),
    ]
    for local, remote in files:
        put(sftp, local, remote)

    print('\n── Admin UI ─────────────────────────────')
    # Créer le dossier admin sur le NAS
    ssh_run(ssh, f'mkdir -p {REMOTE}/frontend/admin')
    admin_files = [
        ('frontend/admin/index.html',    f'{REMOTE}/frontend/admin/index.html'),
        ('frontend/admin/dashboard.html',f'{REMOTE}/frontend/admin/dashboard.html'),
        ('frontend/admin/admin.css',     f'{REMOTE}/frontend/admin/admin.css'),
        ('frontend/admin/admin.js',      f'{REMOTE}/frontend/admin/admin.js'),
    ]
    for local, remote in admin_files:
        put(sftp, local, remote)

def deploy_nginx(sftp):
    print('\n── Nginx ────────────────────────────────')
    put(sftp, 'nginx/conf.d/default.conf', f'{REMOTE}/nginx/conf.d/default.conf')

def restart_containers(ssh, restart_nginx=True):
    print('\n── Restart containers ───────────────────')
    cmd_backend = f'cd {REMOTE} && docker-compose restart backend'
    print(f'  → restart backend')
    ssh_run(ssh, cmd_backend)
    if restart_nginx:
        cmd_nginx = f'cd {REMOTE} && docker-compose exec -T nginx nginx -s reload'
        print(f'  → reload nginx')
        ssh_run(ssh, cmd_nginx)

def main():
    args = sys.argv[1:]
    backend_only  = '--backend-only'  in args
    frontend_only = '--frontend-only' in args

    print('── Connexion au NAS ─────────────────────')
    ssh  = connect()
    sftp = ssh.open_sftp()
    print(f'  Connecté à {NAS_HOST}')

    if not frontend_only:
        deploy_backend(sftp)
    if not backend_only:
        deploy_frontend(sftp, ssh)
        deploy_nginx(sftp)

    restart_nginx = not backend_only
    restart_containers(ssh, restart_nginx=restart_nginx)

    sftp.close()
    ssh.close()
    print('\n✓ Déploiement terminé.\n')

if __name__ == '__main__':
    main()
