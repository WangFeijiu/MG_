---
name: bmad-method
description: This skill should be used when the user mentions "bmad", "BMad", wants to use agile AI-driven development workflows, create PRDs, plan sprints, generate project context, write code stories, run retrospectives, or manage an agile development process.
---

# BMad Method Skill

## Overview

BMad (Breakthrough Method of Agile AI-driven Development) provides structured workflows for AI-assisted development. The bmad-method package is installed at `node_modules/bmad-method/`.

## Quick Commands

```bash
npx bmad-method help
npx bmad-method install
```

## Available Skills

BMad skills are organized into 4 phases:

### Phase 1: Analysis
| Skill | Command | Purpose |
|-------|---------|---------|
| Product Brief | `bmad-product-brief` | Create/update product briefs |
| PRFAQ | `bmad-prfaq` | Press Release + FAQ for pre-launch validation |
| Document Project | `bmad-document-project` | Scan and understand existing code/projects |
| Domain Research | `bmad-domain-research` | Research industry/domain context |
| Market Research | `bmad-market-research` | Analyze market and competition |
| Technical Research | `bmad-technical-research` | Research technical approaches |

### Phase 2: Plan Workflows
| Skill | Command | Purpose |
|-------|---------|---------|
| Create PRD | `bmad-create-prd` | Create product requirements document |
| Validate PRD | `bmad-validate-prd` | Validate PRD completeness |
| Edit PRD | `bmad-edit-prd` | Edit existing PRD |
| UX Design | `bmad-create-ux-design` | Generate UX designs |
| Agent PM | `bmad-agent-pm` | AI Product Manager agent |
| Agent UX Designer | `bmad-agent-ux-designer` | AI UX Designer agent |

### Phase 3: Solutioning
| Skill | Command | Purpose |
|-------|---------|---------|
| Architecture | `bmad-create-architecture` | Design system architecture |
| Create Epics & Stories | `bmad-create-epics-and-stories` | Break PRD into epics/stories |
| Generate Project Context | `bmad-generate-project-context` | Create project context document |
| Check Implementation Readiness | `bmad-check-implementation-readiness` | Verify readiness to code |
| Agent Architect | `bmad-agent-architect` | AI Architect agent |

### Phase 4: Implementation
| Skill | Command | Purpose |
|-------|---------|---------|
| Quick Dev | `bmad-quick-dev` | Build features from requirements |
| Dev Story | `bmad-dev-story` | Develop a specific story |
| Create Story | `bmad-create-story` | Create user stories |
| Sprint Planning | `bmad-sprint-planning` | Plan sprint from backlog |
| Sprint Status | `bmad-sprint-status` | Check sprint progress |
| Code Review | `bmad-code-review` | Review code changes |
| QA E2E Tests | `bmad-qa-generate-e2e-tests` | Generate end-to-end tests |
| Checkpoint Preview | `bmad-checkpoint-preview` | Preview before committing |
| Correct Course | `bmad-correct-course` | Course correction |
| Retrospective | `bmad-retrospective` | Sprint retrospective |
| Agent Dev | `bmad-agent-dev` | AI Developer agent |

## How to Use in This Project

When you want to use a bmad skill, invoke it via the Claude Code skill system:

1. Say `/bmad-product-brief` or describe what you want to do
2. The skill will load the relevant workflow from `node_modules/bmad-method/src/bmm-skills/`
3. Follow the workflow stages

## Resources

All skill source files are in:
```
.claude/skills/bmad-method/
```

Key files per skill:
- `SKILL.md` — Skill definition and stages
- `workflow.md` — Step-by-step instructions
- `steps/` or `steps-c/` — Individual step files
- `templates/` — Output templates
- `prompts/` — Prompts for subagents
- `agents/` — Subagent definitions
- `checklist.md` — Quality checklist

## Example Workflows

### Start a New Feature
1. `/bmad-product-brief` → Define the feature
2. `/bmad-create-prd` → Create requirements
3. `/bmad-create-architecture` → Design approach
4. `/bmad-create-epics-and-stories` → Break down work
5. `/bmad-sprint-planning` → Plan sprint
6. `/bmad-quick-dev` → Implement

### Understand Existing Code
1. `/bmad-document-project` → Scan codebase
2. `/bmad-generate-project-context` → Create context doc
3. Use results for any subsequent bmad workflow
