-- Quick test query to check if aliases are loaded correctly
-- Run this in Supabase SQL Editor to verify data

SELECT 
  full_name,
  aliases,
  array_length(aliases, 1) as num_aliases
FROM club_members
WHERE full_name LIKE '%TÚ%'
ORDER BY full_name;

-- Expected result for ĐỖ ĐỨC TÚ:
-- full_name: ĐỖ ĐỨC TÚ
-- aliases: {DO DUC TU, DUC TU, DD TU}
-- num_aliases: 3
