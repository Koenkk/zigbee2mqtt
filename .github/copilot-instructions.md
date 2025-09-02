# Copilot Coding Agent Instructions for Koenkk/zigbee2mqtt

Welcome! These instructions help ensure Copilot Coding Agent can efficiently collaborate on this repository.

## 1. Codebase Overview
- **Main language:** JavaScript (Node.js), TypeScript
- **Purpose:** Zigbee to MQTT bridge for home automation.
- **Core directories:**
  - `src/`: Main source code (device adapters, communication, logic).
  - `test/`: Automated tests.
  - `docs/`: Documentation.
  - `data/`: Zigbee device definitions.

## 2. Preferred Practices
- **Branching:** Use feature branches (`feat/xyz`) for enhancements and `fix/xyz` for bug fixes.
- **Commits:** Write clear, descriptive commit messages (imperative mood, < 72 chars).
- **Pull Requests:** Reference related issues, provide context, and include before/after behavior if modifying logic. Tag with appropriate labels.
- **Testing:** All code changes should include or update relevant tests. A test coverage of 100% is enforced. Run `npm test:coverage` before submitting PRs.
- **Linting:** Code must pass lint and formatting checks (`npm run check`). Use Biome for formatting.
- **Documentation:** Update relevant docs when adding features or changing behavior.

## 3. Review & Feedback
- All PRs require review by maintainers.
- Automated checks must pass before merging.
- If you’re fixing a bug, include steps to reproduce in the PR description.

## 4. Security & Secrets
- Do not commit secrets, credentials, or private keys.
- Follow the repository’s security policy for vulnerability disclosures.

## 5. Communication
- Use Discussions and Issues for questions and proposals.
- Respect community guidelines and code of conduct.

## 6. Special Instructions for Copilot Coding Agent
- Suggest code changes that strictly adhere to existing styles and patterns.
- Explain reasoning in PR descriptions when implementing complex changes.
- Prioritize backward compatibility unless otherwise specified.
- If uncertain, prompt for clarification via PR comment before proceeding.

---

For more details, see [Best practices for Copilot coding agent in your repository](https://gh.io/copilot-coding-agent-tips) and the repository's CONTRIBUTING.md.