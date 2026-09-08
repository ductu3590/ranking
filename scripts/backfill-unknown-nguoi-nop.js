// Dọn tồn đọng: đặt nguoi_nop = 'Unknown' cho giao dịch chiều vào không khớp roster.
// Chạy: node scripts/backfill-unknown-nguoi-nop.js <groupId>
// Script không tự ghi database. Nó in ra 3 câu SQL để chạy theo thứ tự.
const groupId = Number(process.argv[2]);
if (!Number.isInteger(groupId) || groupId <= 0) {
    console.error('Thiếu groupId hợp lệ. Ví dụ: node scripts/backfill-unknown-nguoi-nop.js 1');
    process.exit(1);
}

console.log(`-- BƯỚC 1: đếm trước (ghi kết quả vào evidence)
select count(*) as se_doi, count(distinct nguoi_nop) as so_chuoi_rac
from quy_pickleball q
where q.group_id = ${groupId}
  and q.huong_giao_dich = 'in'
  and q.nguoi_nop <> 'Unknown'
  and upper(q.nguoi_nop) <> 'THỦ QUỸ'
  and not exists (
    select 1 from club_members m
    where m.group_id = q.group_id and upper(m.full_name) = upper(q.nguoi_nop)
  );

-- BƯỚC 2: cập nhật (chỉ chạy sau khi đã ghi số ở bước 1)
update quy_pickleball q
set nguoi_nop = 'Unknown'
where q.group_id = ${groupId}
  and q.huong_giao_dich = 'in'
  and q.nguoi_nop <> 'Unknown'
  and upper(q.nguoi_nop) <> 'THỦ QUỸ'
  and not exists (
    select 1 from club_members m
    where m.group_id = q.group_id and upper(m.full_name) = upper(q.nguoi_nop)
  );

-- BƯỚC 3: đếm sau (phải bằng 0)
select count(*) as con_lai
from quy_pickleball q
where q.group_id = ${groupId}
  and q.huong_giao_dich = 'in'
  and q.nguoi_nop <> 'Unknown'
  and upper(q.nguoi_nop) <> 'THỦ QUỸ'
  and not exists (
    select 1 from club_members m
    where m.group_id = q.group_id and upper(m.full_name) = upper(q.nguoi_nop)
  );`);