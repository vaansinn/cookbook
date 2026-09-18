# Council skill research — 2026-09-13

Inspected public sources (live main branches, not vendored/pinned dependencies):

- [tsenart/council-skill](https://github.com/tsenart/council-skill): portable
  council skill; inspected SKILL.md and references/protocol.md. Useful independent
  review and cross-examination structure. Its default three-person philosophical
  panel does not match this user's five engineering seats.
- [oliwoodman/llm-council-skill](https://github.com/oliwoodman/llm-council-skill):
  inspected SKILL.md; five advisors, peer review and chairman. Uses thinking styles
  rather than engineering specialties. We do not inherit its broad invocation
  triggers, requirement to sound certain, or suggestions that agreement establishes
  correctness. Role-aware peer review here is not claimed to be anonymous.
- [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents):
  inspected the role catalogue and engineering/backend-architect definition.
  Supplies frontend, backend, security, DevOps and testing specializations, but
  not itself a five-seat council protocol. Some example requirements/metrics are
  inappropriate defaults for a small app. GitHub's retrieved page showed 152.0k
  stars; this is a changing discovery signal, not technical validation.

The skills.sh leaderboard and council searches were checked. Per-skill install
counts were not verified. `npx skills find council` encountered network access
problems in the shell; no third-party skill package was installed. GitHub API
requests for comparative metadata were also blocked. Do not infer low adoption
from missing metadata. The niche council projects are useful references, not
endorsed as proven frameworks.

The local skill is newly written; no third-party code, role files or installer
scripts are bundled or executed. It uses existing host subagents. The first real
exercise is the cookbook's personal-recipe planning review; results and limitations
belong in that project's council run, not in this reusable skill.
