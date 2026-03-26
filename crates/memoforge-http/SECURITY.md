# MemoForge HTTP Server Security

## Overview

The MemoForge HTTP server implements multiple security layers to protect your knowledge base from unauthorized access and abuse.

## Authentication

### Bearer Token Authentication

Write operations (POST, PUT, DELETE) require Bearer token authentication.

**Configuration:**
```bash
export MEMOFORGE_AUTH_TOKEN="your-secret-token"
```

**Usage:**
```bash
curl -H "Authorization: Bearer your-secret-token" \
  -X POST http://localhost:8080/api/knowledge \
  -d '{"title":"Example","content":"..."}'
```

**Best Practices:**
- Use a strong, randomly generated token (minimum 32 characters)
- Rotate tokens periodically
- Never commit tokens to version control
- Use environment variables or secure secret management

## CORS (Cross-Origin Resource Sharing)

Control which web origins can access your API.

**Configuration:**
```bash
# Allow specific origins (comma-separated)
export MEMOFORGE_CORS_ORIGINS="https://example.com,https://app.example.com"
```

**Default Behavior:**
- If `allowed_origins` is empty, CORS is disabled (no cross-origin access)
- Allows all HTTP methods and headers for configured origins

**Best Practices:**
- Only whitelist trusted domains
- Use specific origins instead of wildcards
- For local development, add `http://localhost:3000` or your dev server

## Rate Limiting

Prevents abuse by limiting requests per IP address.

**Configuration:**
```bash
# Allow 60 requests per 60 seconds per IP (default)
export MEMOFORGE_RATE_LIMIT=60
export MEMOFORGE_RATE_LIMIT_WINDOW=60
```

**Behavior:**
- Uses sliding window algorithm
- Tracks requests per IP address
- Returns HTTP 429 (Too Many Requests) when limit exceeded
- Automatically cleans up expired request records

**Recommended Settings:**
- Development: 100-200 requests per minute
- Production: 60 requests per minute
- Public API: 30 requests per minute

## Network Binding

**Default Binding:**
```bash
# Binds to localhost only (default)
MEMOFORGE_HTTP_BIND=127.0.0.1
MEMOFORGE_HTTP_PORT=8080
```

**Security Implications:**
- `127.0.0.1` (default): Only accessible from local machine - **RECOMMENDED**
- `0.0.0.0`: Accessible from any network interface - **USE WITH CAUTION**

**Best Practices:**
- Keep default `127.0.0.1` binding for local-only access
- Use a reverse proxy (nginx, caddy) for external access
- Never expose directly to the internet without TLS

## TLS/HTTPS

The MemoForge HTTP server does **not** implement TLS directly. Use a reverse proxy for HTTPS.

### Recommended: Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl http2;
    server_name kb.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Recommended: Caddy Reverse Proxy

```caddyfile
kb.example.com {
    reverse_proxy localhost:8080
}
```

Caddy automatically handles TLS certificates via Let's Encrypt.

## Read-Only Mode

Disable all write operations for public or untrusted access.

**Configuration:**
```bash
export MEMOFORGE_READONLY=true
```

**Use Cases:**
- Public knowledge base sharing
- Read-only API for external consumers
- Backup/mirror servers

## Security Checklist

- [ ] Set a strong `MEMOFORGE_AUTH_TOKEN`
- [ ] Configure `MEMOFORGE_CORS_ORIGINS` for your domains
- [ ] Keep default `127.0.0.1` binding unless using reverse proxy
- [ ] Use TLS via reverse proxy for external access
- [ ] Set appropriate rate limits for your use case
- [ ] Enable `MEMOFORGE_READONLY` for public instances
- [ ] Keep MemoForge updated to latest version
- [ ] Monitor logs for suspicious activity
- [ ] Use firewall rules to restrict access
- [ ] Regular security audits of your deployment

## Threat Model

**Protected Against:**
- Unauthorized write access (via Bearer token)
- Cross-origin attacks (via CORS)
- Rate limiting abuse (via IP-based limits)
- Network exposure (via localhost binding)

**Not Protected Against:**
- Man-in-the-middle attacks (use TLS via reverse proxy)
- DDoS attacks (use CDN/WAF)
- Compromised authentication tokens (rotate regularly)
- Local privilege escalation (OS-level security)

## Reporting Security Issues

If you discover a security vulnerability, please email security@example.com with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

Do not disclose publicly until patched.
