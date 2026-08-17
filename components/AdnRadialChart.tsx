import React, { useMemo } from 'react';

export interface AdnRadialChartDatum {
  label: string;
  value: number;
  count: number;
}

interface AdnRadialChartProps {
  data: AdnRadialChartDatum[];
  maxItems?: number;
}

const VIEWBOX_WIDTH = 360;
const VIEWBOX_HEIGHT = 224;
const CENTER_X = 108;
const CENTER_Y = 112;
const OUTER_RADIUS = 88;
const INNER_RADIUS = 28;

const pointOnArc = (radius: number, angle: number) => {
  const radians = (angle * Math.PI) / 180;
  return {
    x: CENTER_X + radius * Math.cos(radians),
    y: CENTER_Y + radius * Math.sin(radians),
  };
};

const leftArcPath = (radius: number, progress = 1) => {
  const start = pointOnArc(radius, -90);
  const end = pointOnArc(radius, -90 - 180 * progress);
  const largeArc = progress > 0.5 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`;
};

const colorForRank = (index: number) => {
  if (index === 0) return '#D9FF00';
  if (index === 1) return '#FFFFFF';
  if (index === 2) return '#A3A3A3';
  return '#555555';
};

/**
 * A flat, left-facing radial bar chart for the cinema DNA section.
 * The most represented imprint sits on the outer track; every other one nests inside it.
 */
const AdnRadialChart: React.FC<AdnRadialChartProps> = ({ data, maxItems = 6 }) => {
  const items = useMemo(() => {
    const total = data.reduce((sum, item) => sum + Math.max(0, item.value), 0);

    return [...data]
      .filter((item) => item.value > 0)
      .sort((first, second) => second.value - first.value || second.count - first.count)
      .slice(0, maxItems)
      .map((item) => ({
        ...item,
        percentage: total > 0 ? Math.round((item.value / total) * 100) : 0,
      }));
  }, [data, maxItems]);

  if (!items.length) return null;

  const radiusStep = items.length > 1 ? (OUTER_RADIUS - INNER_RADIUS) / (items.length - 1) : 0;
  const strokeWidth = Math.min(10, Math.max(6, radiusStep - 2));

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      role="img"
      aria-label="Répartition de tes empreintes cinéma"
      className="mt-5 block h-auto w-full"
    >
      <g fill="none" stroke="#222222" strokeWidth={strokeWidth} strokeLinecap="butt">
        {items.map((_, index) => (
          <path key={index} d={leftArcPath(OUTER_RADIUS - index * radiusStep)} />
        ))}
      </g>

      <g fill="none" strokeWidth={strokeWidth} strokeLinecap="butt">
        {items.map((item, index) => (
          <path
            key={item.label}
            d={leftArcPath(OUTER_RADIUS - index * radiusStep, item.percentage / 100)}
            stroke={colorForRank(index)}
          />
        ))}
      </g>

      {items.map((item, index) => {
        const color = colorForRank(index);
        const radius = OUTER_RADIUS - index * radiusStep;
        const guideY = CENTER_Y - radius;
        const labelY = guideY + 3;
        const meta = `${item.percentage}% · ${item.count} FILM${item.count > 1 ? 'S' : ''}`;

        return (
          <g key={item.label}>
            <line x1={CENTER_X + strokeWidth / 2 + 5} y1={guideY} x2="154" y2={guideY} stroke={color} strokeWidth="1" />
            <text
              x="162"
              y={labelY}
              fill={index === 0 ? '#FFFFFF' : color === '#555555' ? '#A3A3A3' : color}
              fontFamily="Inter, Arial, sans-serif"
              fontSize="9"
              fontWeight="800"
              letterSpacing="1"
            >
              {item.label.toUpperCase()}
            </text>
            <text
              x="348"
              y={labelY}
              textAnchor="end"
              fill={index === 0 ? '#D9FF00' : '#888888'}
              fontFamily="Inter, Arial, sans-serif"
              fontSize="8"
              fontWeight="800"
              letterSpacing="0.55"
            >
              {meta}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export default AdnRadialChart;
