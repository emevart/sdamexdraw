// sdamex #5706: pen samples of one touch, without re-delivered ones (pen ink
// v2). Safari on iPadOS returns in `getCoalescedEvents()` of a pointermove
// samples of the previous pointermove again, and a sample held back from it
// (WebKit #316105: x 100, 101, 102, 104, then 101, 102, 103, 104). Kept as
// they came, the stroke jumps back and goes over the arc of the frame again:
// a straight chord inside a fast loop, longer the longer the frame.

export type FreedrawInputSample = {
  clientX: number;
  clientY: number;
  pressure: number;
  timeStamp?: number;
};

/** Accepted samples remembered for the repeat check. */
const REPEAT_MEMORY = 256;
/** New samples a re-delivered stretch may hold between its repeats. */
const STRETCH_GAP = 2;

const hasTime = (sample: FreedrawInputSample) =>
  typeof sample.timeStamp === "number" &&
  Number.isFinite(sample.timeStamp) &&
  sample.timeStamp > 0;

/**
 * A filter for the samples of one pointer session. Each call takes the
 * samples of one pointermove (coalesced, plus the event when it differs) and
 * returns the new ones.
 *
 * - With a time of its own on every sample, a sample older than the newest
 *   one accepted from an earlier pointermove is dropped, and so is a sample
 *   of that very time that repeats x, y and pressure of an accepted one.
 * - Without such times (no `timeStamp`, or one time for the whole list), a
 *   sample that repeats x, y and pressure of one of the last REPEAT_MEMORY
 *   accepted samples is dropped. When the list starts with such a repeat, the
 *   re-delivered stretch goes too: up to its last repeat, with the samples
 *   held back between them.
 */
export const createFreedrawSampleFilter = (start?: FreedrawInputSample) => {
  let floor = start && hasTime(start) ? start.timeStamp! : -Infinity;
  const memory = new Float64Array(REPEAT_MEMORY * 3);
  let remembered = 0;
  let next = 0;

  const remember = (sample: FreedrawInputSample) => {
    memory[next * 3] = sample.clientX;
    memory[next * 3 + 1] = sample.clientY;
    memory[next * 3 + 2] = sample.pressure;
    next = (next + 1) % REPEAT_MEMORY;
    remembered = Math.min(REPEAT_MEMORY, remembered + 1);
  };

  const isRepeat = (sample: FreedrawInputSample) => {
    for (let i = 0; i < remembered; i++) {
      if (
        memory[i * 3] === sample.clientX &&
        memory[i * 3 + 1] === sample.clientY &&
        memory[i * 3 + 2] === sample.pressure
      ) {
        return true;
      }
    }
    return false;
  };

  if (start) {
    remember(start);
  }

  return <T extends FreedrawInputSample>(samples: readonly T[]): T[] => {
    if (!samples.length) {
      return [];
    }
    const timed =
      samples.every(hasTime) &&
      (samples.length === 1 ||
        samples.some((sample) => sample.timeStamp !== samples[0].timeStamp));
    const accepted: T[] = [];
    let newest = floor;
    if (timed) {
      for (const sample of samples) {
        // a coarse clock (1 ms, privacy modes) gives distinct samples one
        // time: at the time of the newest accepted, only a repeat is dropped
        if (
          sample.timeStamp! < floor ||
          (sample.timeStamp === floor && isRepeat(sample))
        ) {
          continue;
        }
        accepted.push(sample);
        remember(sample);
        newest = Math.max(newest, sample.timeStamp!);
      }
    } else {
      // a re-delivered stretch opens the list: repeats, with up to
      // STRETCH_GAP new samples between them (held back ones)
      let from = 0;
      if (isRepeat(samples[0])) {
        let gap = 0;
        for (let i = 0; i < samples.length && gap <= STRETCH_GAP; i++) {
          if (isRepeat(samples[i])) {
            from = i + 1;
            gap = 0;
          } else {
            gap++;
          }
        }
      }
      for (let i = from; i < samples.length; i++) {
        const sample = samples[i];
        if (isRepeat(sample)) {
          continue;
        }
        accepted.push(sample);
        remember(sample);
        if (hasTime(sample)) {
          newest = Math.max(newest, sample.timeStamp!);
        }
      }
    }
    floor = newest;
    return accepted;
  };
};
