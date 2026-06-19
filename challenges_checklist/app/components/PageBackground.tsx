import { pageBackground } from "../lib/theme";

// Fondo de página "Season X": degradado azul del lobby + una malla triangular
// (SVG vectorial → nítida a cualquier resolución, incluso 4K) repetida como
// background-image en dos capas con parallax. La animación es solo `transform`
// sobre capas sobredimensionadas (compuesto en GPU, sin repaint por frame → sin
// lag) y el desplazamiento es de EXACTAMENTE una baldosa, así que el bucle es
// invisible. El fade (viñeta) vive en un padre estático para que no se mueva.
//
// Se monta como capa fija detrás del contenido (z-index:-1); por eso las
// páginas usan `pageMain` con fondo transparente. El overlay (OBS) NO incluye
// este componente, así que sigue siendo transparente.
export default function PageBackground() {
  return (
    <div className="fn-bg" aria-hidden style={{ background: pageBackground }}>
      <div className="fn-bg-fade">
        <div className="fn-bg-mesh fn-bg-mesh--b" />
      </div>
      <div className="fn-bg-fade">
        <div className="fn-bg-mesh fn-bg-mesh--a" />
      </div>

      {/* Tinte de PRESTIGIO: se enciende con html[data-prestige="on"] y toma el
          color de la semana vía --prestige-accent (lo fija ChallengeChecklist). */}
      <div className="fn-bg-prestige" />
    </div>
  );
}
