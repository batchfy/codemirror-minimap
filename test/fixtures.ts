/** A document with enough distinct token types to exercise the font cache. */
export const SAMPLE = `import { select, transition, easeLinear } from 'd3';
import data from './data.csv';
import './styles.css';

export const main = (container) => {
  const svg = select(container)
    .selectAll('svg')
    .data([1])
    .attr('width', container.clientWidth)
    .attr('height', container.clientHeight);

  const slow = transition().duration(2000);
  const fast = transition().duration(200).ease(easeLinear);

  svg
    .selectAll('circle')
    .data(data, (d) => d.id)
    .join(
      (enter) => enter.append('circle').attr('r', 0),
      (update) => update.attr('cx', (d) => d.x),
      (exit) => exit.remove(),
    )
    .attr('opacity', 880 / 1000);
};
`;

export function repeat(text: string, times: number): string {
    return Array.from({ length: times }, () => text).join("\n");
}
