-- Do duoc: correction va advance DA tuan tu hoa san voi nhau, vi
-- apply_tournament_result_correction_graph_aware lay
--   SELECT ... FROM tournament_stages ... FOR SHARE
-- con advance_division_group_rank_transitions lay FOR UPDATE tren cung dong.
-- FOR SHARE xung khac FOR UPDATE nen ben den sau PHAI cho.
--
-- Van de con lai khong phai an toan ma la trai nghiem: ben cho se treo den khi
-- het statement_timeout roi chet bang 57014 -> HTTP 500 mo ho (do duoc 9.7s).
-- Dat lock_timeout ngan o muc FUNCTION: ai cho qua 2s thi bo cuoc ngay voi 55P03,
-- route dich thanh 409 ro rang. Khong dong vao than ham, khong doi logic.
ALTER FUNCTION public.apply_tournament_result_correction_graph_aware(bigint,bigint,jsonb,bigint,integer,text,text,text)
  SET lock_timeout = '2s';

ALTER FUNCTION public.advance_division_group_rank_transitions(bigint,bigint,jsonb,text,text)
  SET lock_timeout = '2s';

ALTER FUNCTION public.apply_tournament_result_correction(bigint,bigint,bigint,integer)
  SET lock_timeout = '2s';
