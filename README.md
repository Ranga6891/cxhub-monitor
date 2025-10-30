# Server & Application Monitoring System

A lightweight Docker-based monitoring solution for tracking server health, port availability, and HTTP endpoint status.

## Quick Start

### 1. Build and Start

```bash
docker-compose up -d --build
```

### 2. Access

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api/health

### 3. Usage

1. Add a server (name + IP/hostname)
2. Add applications to the server
3. Configure port and/or health check URL
4. Monitor automatically every minute

## Features

- Multi-server monitoring
- Port checks (netcat/telnet)
- HTTP health checks (expects 200 OK)
- Real-time dashboard
- Automated checks (every minute)
- SQLite database (no separate DB container)
- Check history tracking

## Configuration

Edit `docker-compose.yml` to change ports:

```yaml
ports:
  - "3000:80"    # Frontend
  - "3001:3001"  # Backend
```

## Data Persistence

Database stored in `./data/monitoring.db`

Backup:
```bash
cp ./data/monitoring.db ./data/monitoring.db.backup
```

Reset:
```bash
docker-compose down
rm ./data/monitoring.db
docker-compose up -d
```

## Logs

```bash
docker-compose logs -f
docker-compose logs backend
docker-compose logs frontend
```

## Stop/Restart

```bash
docker-compose down
docker-compose restart
docker-compose up -d
```

## Troubleshooting

- Port checks failing: Check firewall and network connectivity
- Health checks failing: Verify URL returns HTTP 200
- Containers not starting: Check `docker-compose logs`

## API Endpoints

- `GET /api/dashboard` - Dashboard summary
- `GET /api/servers` - List servers
- `POST /api/servers` - Create server
- `POST /api/applications` - Create application
- `POST /api/applications/:id/check` - Manual check

