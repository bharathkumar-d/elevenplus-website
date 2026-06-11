import groupQuestionsByPassage from './groupQuestionsByPassage';

const P1 = { id: 'p1', title: 'Passage One' };
const P2 = { id: 'p2', title: 'Passage Two' };

describe('groupQuestionsByPassage', () => {
  test('first question WITHOUT a passage does not crash (regression: blank Questions page)', () => {
    const questions = [
      { id: 'q1', passage_id: null },
      { id: 'q2', passage_id: null },
    ];
    const groups = groupQuestionsByPassage(questions, []);
    expect(groups).toHaveLength(1);
    expect(groups[0].passage).toBeNull();
    expect(groups[0].questions.map(x => x.q.id)).toEqual(['q1', 'q2']);
  });

  test('groups consecutive questions under their passage', () => {
    const questions = [
      { id: 'q1', passage_id: 'p1' },
      { id: 'q2', passage_id: 'p1' },
      { id: 'q3', passage_id: null },
      { id: 'q4', passage_id: 'p2' },
    ];
    const groups = groupQuestionsByPassage(questions, [P1, P2]);
    expect(groups).toHaveLength(3);
    expect(groups[0].passage).toEqual(P1);
    expect(groups[0].questions).toHaveLength(2);
    expect(groups[1].passage).toBeNull();
    expect(groups[2].passage).toEqual(P2);
  });

  test('passage referenced by question but missing from passages list yields null passage', () => {
    const questions = [{ id: 'q1', passage_id: 'ghost' }];
    const groups = groupQuestionsByPassage(questions, []);
    expect(groups).toHaveLength(1);
    expect(groups[0].passage).toBeNull();
    expect(groups[0].passageId).toBe('ghost');
  });

  test('non-consecutive same passage produces separate groups (preserves paper order)', () => {
    const questions = [
      { id: 'q1', passage_id: 'p1' },
      { id: 'q2', passage_id: null },
      { id: 'q3', passage_id: 'p1' },
    ];
    const groups = groupQuestionsByPassage(questions, [P1]);
    expect(groups).toHaveLength(3);
  });

  test('handles empty and missing input', () => {
    expect(groupQuestionsByPassage([], [])).toEqual([]);
    expect(groupQuestionsByPassage(undefined, undefined)).toEqual([]);
  });

  test('original indices are preserved through grouping', () => {
    const questions = [
      { id: 'q1', passage_id: 'p1' },
      { id: 'q2', passage_id: null },
    ];
    const groups = groupQuestionsByPassage(questions, [P1]);
    expect(groups[0].questions[0].idx).toBe(0);
    expect(groups[1].questions[0].idx).toBe(1);
  });
});
