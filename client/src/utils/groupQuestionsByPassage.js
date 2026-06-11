/**
 * Group an ordered list of questions into consecutive runs sharing the same passage.
 * Questions without a passage_id form their own (passage: null) groups.
 *
 * Returns: [{ passageId, passage, questions: [{ q, idx }] }]
 */
export default function groupQuestionsByPassage(questions, passages) {
  const passageMap = {};
  (passages || []).forEach(p => { passageMap[p.id] = p; });

  const groups = [];
  let lastPassageId; // undefined sentinel — guarantees the first question always opens a group

  (questions || []).forEach((q, idx) => {
    const pid = q.passage_id || 'NONE';
    if (pid !== lastPassageId) {
      groups.push({ passageId: pid, passage: passageMap[pid] || null, questions: [] });
      lastPassageId = pid;
    }
    groups[groups.length - 1].questions.push({ q, idx });
  });

  return groups;
}
