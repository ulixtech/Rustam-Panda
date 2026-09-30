# 🤝 Contributing to Rustam Panda

First off, thank you for considering contributing to **Rustam Panda**! Extensions thrive on community feedback, bug reports, and creative contributions.

---

## 🛠️ Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/abbyisonline/rustam-panda.git
   cd rustam-panda
   ```

2. **Load into Google Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`.
   - Enable **Developer mode** toggle in the top-right corner.
   - Click **Load unpacked** and select the root directory of this repository.

3. **Code Style Guidelines**:
   - Vanilla JS and Vanilla CSS (no heavy runtime bundlers required).
   - Maintain the **Moody White-Base** aesthetic tokens defined in `overlay.css` and `popup.css`.
   - Preserve zero-shadow minimalist button styling.
   - Guard DOM manipulation with defensive null checks (`if (el) ...`).
   - Validate syntax before committing:
     ```bash
     node -c content.js && node -c popup.js && node -c report.js && node -c interceptor.js
     ```

---

## 🌿 Git Workflow

1. Fork the repo and create your branch from `main`:
   ```bash
   git checkout -b feature/awesome-feature
   ```
2. Commit your changes using conventional commit prefixes (`feat:`, `fix:`, `docs:`, `style:`, `refactor:`).
3. Push to your branch and open a Pull Request.

---

## 💡 Submitting Issues

- Ensure the bug was not already reported by searching on GitHub Issues.
- Provide a clear and concise description of the bug along with Chrome version, operating system, and steps to reproduce.

Developed with ❤️ by **@abbyisonline**.
