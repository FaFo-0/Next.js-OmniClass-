// Authoritative Omnica brand mark.
// Path data lifted verbatim from the user-provided
// `whait background.svg` / `yallow background.svg` (Downloads).
// Background rect intentionally omitted so the mark stays
// transparent and sits cleanly on any surface.
//
// Colors are exposed as props so a tenant override can recolor
// the ring + corner without swapping the asset. Default values
// match the Omnica English palette.

interface OmnicaMarkProps {
  size?: number;
  ringColor?: string; // big "C" + small corner accent
  lensColor?: string; // inner donut lens
  className?: string;
}

export function OmnicaMark({
  size = 34,
  ringColor = "#6716A4",
  lensColor = "#FFCA00",
  className,
}: OmnicaMarkProps) {
  // Original SVG used viewBox 0 0 2000 2000 with a background rect.
  // We translate the artwork group identically but leave the
  // background out so the mark renders transparent.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 2000 2000"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <g transform="matrix(1,0,0,1,-2867.451,-4117.687)">
        <g transform="matrix(0.710227,0,0,1.302083,831.94,-12.522)">
          <g transform="matrix(4.541972,0,0,2.477439,-2121.097,2444.708)">
            <g transform="matrix(1.898252,0,0,1.898252,-1426.223,-437.541)">
              <path
                d="M1493.069,411.462L1493.069,548.454L1630.062,548.454C1630.062,624.113 1568.728,685.446 1493.069,685.446C1417.461,685.446 1356.077,624.062 1356.077,548.454C1356.077,472.795 1417.411,411.462 1493.069,411.462Z"
                fill={ringColor}
              />
            </g>
            <g transform="matrix(0.978926,0,0,0.978926,30.157,12.729)">
              <g transform="matrix(1.119139,0,0,1.119139,-167.747,-71.908)">
                <path
                  d="M1591.88,603.563C1591.88,705.05 1509.486,787.444 1408,787.444C1306.514,787.444 1224.12,705.05 1224.12,603.563C1224.12,502.077 1306.514,419.683 1408,419.683L1408,473.54C1336.238,473.54 1277.977,531.802 1277.977,603.563C1277.977,675.325 1336.238,733.586 1408,733.586C1479.762,733.586 1538.023,675.325 1538.023,603.563L1591.88,603.563Z"
                  fill={lensColor}
                />
              </g>
              <g transform="matrix(1.119139,0,0,1.119139,-167.747,-71.908)">
                <path
                  d="M1408,419.683C1509.486,419.683 1591.88,502.077 1591.88,603.563L1538.023,603.563C1538.023,531.802 1479.762,473.54 1408,473.54L1408,419.683Z"
                  fill={ringColor}
                />
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
