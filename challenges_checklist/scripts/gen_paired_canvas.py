"""Generate s8-challenges-paired.canvas.tsx from challenges_paired.json."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = json.loads((ROOT / "challenges_paired.json").read_text(encoding="utf-8"))
OUT = Path(
    r"C:\Users\sebas\.cursor\projects\e-project-challengesChecklist-app\canvases\s8-challenges-paired.canvas.tsx"
)

weeks_js = json.dumps(DATA, ensure_ascii=False, indent=2)

TSX = f'''import {{
  Card,
  CardBody,
  CardHeader,
  CollapsibleSection,
  H1,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
}} from "cursor/canvas";

type ChallengeRow = {{
  num: number;
  normal: string;
  normalProg: string;
  prestige: string;
  prestigeProg: string;
}};

type WeekBlock = {{ week: number; rows: ChallengeRow[] }};

const WEEKS: WeekBlock[] = {weeks_js};

export default function S8ChallengesPaired() {{
  const totalNormals = WEEKS.reduce((s, w) => s + w.rows.length, 0);

  return (
    <Stack gap={{24}} style={{{{ padding: 24, maxWidth: 1400, margin: "0 auto" }}}}>
      <Stack gap={{8}}>
        <H1>Temporada 8 — Normales y prestigio</H1>
        <Text tone="secondary">
          108 desafíos normales con prestigio emparejado por unidad (fases de una
          línea comparten el mismo prestigio). Progreso actual desde Supabase.
        </Text>
        <Row gap={{12}} wrap>
          <Stat label="Normales" value={{String(totalNormals)}} />
          <Stat label="Semanas" value="10" />
        </Row>
      </Stack>

      {{WEEKS.map((w) => (
        <CollapsibleSection
          key={{w.week}}
          title={{`Semana ${{w.week}}`}}
          count={{w.rows.length}}
          defaultOpen={{w.week <= 2}}
          trailing={{
            <Pill tone="neutral" size="sm">
              #{{w.rows[0]?.num}}–{{w.rows[w.rows.length - 1]?.num}}
            </Pill>
          }}
        >
          <Card variant="outline">
            <CardHeader title="Normal · Prestigio" />
            <CardBody style={{{{ padding: 0 }}}}>
              <Table
                framed
                striped
                stickyHeader
                headers={{["#", "Normal", "Prog.", "Prestigio", "Prog."]}}
                columnAlign={{["right", "left", "right", "left", "right"]}}
                rows={{w.rows.map((r) => [
                  String(r.num),
                  r.normal,
                  r.normalProg,
                  r.prestige === "—" ? (
                    <Text tone="tertiary" key={{`p-${{r.num}}`}}>—</Text>
                  ) : (
                    r.prestige
                  ),
                  r.prestigeProg,
                ])}}
              />
            </CardBody>
          </Card>
        </CollapsibleSection>
      ))}}

      <Text tone="tertiary" size="small">
        Fuente: Supabase · Temporada 8
      </Text>
    </Stack>
  );
}}
'''

OUT.write_text(TSX, encoding="utf-8")
print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")
