/**
 * يتحقق من تداخل وقتين. مثال: حجز من 10:00 إلى 10:30 يتداخل مع طلب يبدأ
 * 10:15، لذلك لا يمكن قبول الطلب الثاني عند الحلاق نفسه في اليوم نفسه.
 */
export function hasTimeOverlap(
  existingStart: number,
  existingEnd: number,
  requestedStart: number,
  requestedEnd: number,
) {
  return existingStart < requestedEnd && requestedStart < existingEnd;
}
