# 🔒 Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| < 1.1.0 | :x:                |

---

## 🛡️ Privacy & Security Architecture

**Rustam Panda** is designed with privacy-first and client-side isolation principles:

1. **Local Key Storage**:
   - Your OpenRouter API key is stored exclusively inside your browser's private Chrome Extension storage (`chrome.storage.sync` and `chrome.storage.local`).
   - The key is **NEVER** transmitted to any third-party server, analytics collector, or remote backend.

2. **Direct HTTPS Communication**:
   - AI queries are dispatched directly from your browser client to the official OpenRouter API endpoint (`https://openrouter.ai/api/v1/chat/completions`) using standard TLS/HTTPS encryption.

3. **Manifest V3 Isolation**:
   - Built under Chrome's strict Manifest V3 specification without `unsafe-eval` or unauthorized script injection.
   - GraphQL network interception occurs entirely in memory within your active browser tab.

---

## 🚨 Reporting a Vulnerability

If you discover a security vulnerability within Rustam Panda, please report it responsibly:

- **Contact**: Reach out directly to **[@abbyisonline](https://t.me/abbyisonline)** on Telegram or via GitHub (**[@ulixtech](https://github.com/ulixtech)**).
- Please include:
  - Description of the issue
  - Steps to reproduce
  - Potential impact
- We will acknowledge receipt of your vulnerability report within 48 hours and work diligently to release a patch.
