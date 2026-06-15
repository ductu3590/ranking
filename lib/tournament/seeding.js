// Thứ tự slot gieo hạt chuẩn cho bracket kích thước B (lũy thừa 2).
// Mỗi vòng nhân đôi: mỗi hạt v sinh cặp (v, sum-v) với sum = B_hiện_tại + 1.
// Vị trí chẵn giữ thứ tự (v, sum-v), vị trí lẻ đảo (sum-v, v) để các hạt cao
// được tách xa nhau tối đa trên cây — khớp shape test architect đã chốt
// (B=4 -> [1,4,3,2], B=8 -> [1,8,5,4,3,6,7,2]).
// LƯU Ý: bản dựng trong spec Task 2 (luôn push (v, sum-v)) cho ra [1,4,2,3]
// không khớp test; đã sửa thuật toán theo đúng output kỳ vọng. Cần architect review.
function seedOrder(bracketSize) {
  let rounds = Math.log2(bracketSize);
  if (!Number.isInteger(rounds)) throw new Error('bracketSize phải là lũy thừa 2');
  let order = [1, 2];
  for (let r = 1; r < rounds; r++) {
    const next = [];
    const sum = order.length * 2 + 1;
    for (let i = 0; i < order.length; i++) {
      const v = order[i];
      if (i % 2 === 0) {
        next.push(v);
        next.push(sum - v);
      } else {
        next.push(sum - v);
        next.push(v);
      }
    }
    order = next;
  }
  return order;
}
function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}
module.exports = { seedOrder, nextPowerOfTwo };
