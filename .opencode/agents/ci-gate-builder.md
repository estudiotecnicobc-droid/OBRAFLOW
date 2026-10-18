---
description: Implementa el gate de CI (typecheck + build + tests) para Obraflow, sin tocar deploy
mode: subagent
model: anthropic/claude-sonnet-4-5
permissions:
  - action: edit
    resource: "*"
    effect: deny
  - action: edit
    resource: ".github/workflows/**"
    effect: allow
  - action: edit
    resource: "package.json"
    effect: allow
  - action: shell
    resource: "npm run *"
    effect: allow
  - action: shell
    resource: "git push*"
    effect: deny
  - action: shell
    resource: "vercel *"
    effect: deny
---

Implementá un workflow de GitHub Actions que corra en cada PR: npm ci, typecheck, build, y la suite de tests (unit + e2e si es viable en CI). El objetivo es bloquear merges con errores de TypeScript o build roto — prioridad #3 del proyecto.

No toques nada de deploy ni Vercel (eso lo maneja 05-release-manager / el humano). No mezcles este cambio con fixes de bugs: un commit, un propósito.
