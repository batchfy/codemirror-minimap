/** The document from the upstream performance report, used as the baseline. */
export const SAMPLE = `import { select, transition, easeLinear } from 'd3';
import data from './data.csv';
import './styles.css';

export const main = (container) => {
  const svg = select(container)
    .selectAll('svg')
    .data([1])
    .join('svg')
    .attr('width', container.clientWidth)
    .attr('height', container.clientHeight);

  const slow = transition().duration(2000);
  const fast = transition().duration(200).ease(easeLinear);

  svg
    .selectAll('circle')
    .data(data, (d) => d.id)
    .join(
      (enter) =>
        enter
          .append('circle')
          .attr('r', 0)
          .attr('cx', (d) => d.x)
          .attr('cy', (d) => d.y)
          .attr('fill', (d) => d.fill)
          .call((selection) => {
            selection
              .transition(slow)
              .delay((d, i) => i * 200)
              .attr('r', (d) => d.r);
          }),
      (update) =>
        update.call((selection) => {
          selection
            .transition(fast)
            .attr('cx', (d) => d.x)
            .attr('cy', (d) => d.y)
            .attr('r', (d) => d.r)
            .attr('fill', (d) => d.fill);
        }),
      (exit) =>
        exit.call((selection) =>
          selection.transition(slow).attr('r', 0).remove(),
        ),
    )
    .attr('opacity', 880 / 1000);
};
`;
