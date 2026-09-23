-- Actual v3 integration suite. All cases and the complete suite roll back.
BEGIN;
-- Seed only the shortfall, inside the outer rollback and before the case baseline.
-- Explicit unused positive IDs satisfy validation without advancing sequences.
-- Never alter existing identity rows; any ID collision aborts the transaction.
DO $$
DECLARE missing_count integer; member_id bigint; athlete_id bigint; i integer;
BEGIN
  SELECT greatest(0,16-count(*)) INTO missing_count
  FROM public.club_members cm
  WHERE cm.group_id=19 AND cm.is_active IS DISTINCT FROM false
    AND EXISTS (SELECT 1 FROM public.athletes a WHERE a.legacy_club_member_id=cm.id);
  IF missing_count > 0 THEN
    SELECT greatest(980000000,coalesce(max(id),0)+1) INTO member_id FROM public.club_members;
    SELECT greatest(981000000,coalesce(max(id),0)+1) INTO athlete_id FROM public.athletes;
    FOR i IN 1..missing_count LOOP
      INSERT INTO public.club_members(id,group_id,full_name,is_active) OVERRIDING SYSTEM VALUE
      VALUES(member_id,19,'QA098 rollback-only member '||i,true);
      INSERT INTO public.athletes(id,display_name,normalized_name,status,legacy_club_member_id) OVERRIDING SYSTEM VALUE
      SELECT athlete_id,'QA098 rollback-only athlete '||i,'qa098 rollback-only athlete '||i,'unclaimed',member_id
      WHERE NOT EXISTS (SELECT 1 FROM public.athletes a WHERE a.legacy_club_member_id=member_id);
      member_id:=member_id+1; athlete_id:=athlete_id+1;
    END LOOP;
  END IF;
END $$;
CREATE TEMP TABLE qa098_results(label text PRIMARY KEY,result text) ON COMMIT DROP;
CREATE FUNCTION pg_temp.snap() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r record; x jsonb; o jsonb:='{}';
BEGIN
 FOR r IN SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='group_id' ORDER BY table_name LOOP
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb) FROM public.%I t WHERE group_id=19',r.table_name) INTO x;
 o:=o||jsonb_build_object(r.table_name,x); END LOOP; RETURN o;
END $$;
DO $$
DECLARE base jsonb; d jsonb; orig jsonb; mem jsonb; ps jsonb; asgn jsonb; fp text; key text;
 resp jsonb; replay jsonb; prior jsonb; c record; i int; n int; a int; want int;
 e text; s text; got text; gs text; path text[];
BEGIN
 SELECT setup_draft INTO STRICT orig FROM public.tournament_divisions WHERE group_id=19 AND tournament_id=196 AND id=180 AND setup_revision=7 AND roster_lock_status='open';
 ASSERT jsonb_array_length(orig->'pairs')=5,'draft pairs';
 ASSERT (SELECT count(*) FROM jsonb_array_elements(orig#>'{draw,assignments}')x WHERE x->>'groupLabel'='A')=3,'A3';
 fp:=orig#>>'{draw,previewFingerprint}';
 SELECT jsonb_agg(id::text ORDER BY id) INTO mem FROM (
 SELECT cm.id FROM public.club_members cm WHERE cm.group_id=19 AND cm.is_active IS DISTINCT FROM false AND EXISTS(SELECT 1 FROM public.athletes a WHERE a.legacy_club_member_id=cm.id) ORDER BY cm.id LIMIT 16)q;
 ASSERT jsonb_array_length(mem)=16,'16 identities'; base:=pg_temp.snap();
 FOR c IN SELECT * FROM (VALUES
 ('persisted',5),('pairs4',4),('pairs5',5),('pairs6',6),('pairs7',7),('pairs8',8),
 ('unbalanced',5),('swapped',5),('below4',3),('duplicate_slots',5),('gapped_slots',5),('duplicate_pairs',5),('duplicate_members',5),('duplicate_selected',5),('stale_revision',5),('stale_fingerprint',5),
 ('pairs_missing',5),('pairs_null',5),('pairs_scalar',5),('selected_missing',5),('selected_null',5),('selected_scalar',5),('assignments_missing',5),('assignments_null',5),('assignments_scalar',5),('pair_members_missing',5),('pair_members_null',5),('pair_members_scalar',5))z(label,cnt) LOOP
 n:=c.cnt; a:=(n+1)/2; d:=orig; e:=NULL; s:='22023';
 IF c.label<>'persisted' THEN
 ps:='[]'; asgn:='[]';
 FOR i IN 1..n LOOP
 ps:=ps||jsonb_build_array(jsonb_build_object('pairId','qa-'||i,'memberIds',jsonb_build_array(mem->((i-1)*2),mem->((i-1)*2+1))));
 asgn:=asgn||jsonb_build_array(jsonb_build_object('entrantId','qa-'||i,'groupLabel',CASE WHEN i<=a THEN 'A' ELSE 'B' END,'slot',CASE WHEN i<=a THEN i ELSE i-a END)); END LOOP;
 d:=jsonb_set(d,'{pairs}',ps); d:=jsonb_set(d,'{participants,memberIds}',(SELECT jsonb_agg(value ORDER BY ordinality) FROM jsonb_array_elements(mem) WITH ORDINALITY WHERE ordinality<=2*n)); d:=jsonb_set(d,'{draw,assignments}',asgn);
 END IF;
 CASE c.label
 WHEN 'unbalanced' THEN d:=jsonb_set(jsonb_set(jsonb_set(d,'{draw,assignments,3,groupLabel}','"A"'),'{draw,assignments,3,slot}','4'),'{draw,assignments,4,slot}','1'); e:='DRAW_ASSIGNMENTS_INVALID';
 WHEN 'swapped' THEN d:=jsonb_set(jsonb_set(d,'{draw,assignments,2,groupLabel}','"B"'),'{draw,assignments,2,slot}','3'); e:='DRAW_ASSIGNMENTS_INVALID';
 WHEN 'below4' THEN e:='INTERNAL_DOUBLES_GROUP_KNOCKOUT_INVALID';
 WHEN 'duplicate_slots' THEN d:=jsonb_set(d,'{draw,assignments,1,slot}','1'); e:='DRAW_ASSIGNMENTS_INVALID';
 WHEN 'gapped_slots' THEN d:=jsonb_set(d,'{draw,assignments,2,slot}','4'); e:='DRAW_ASSIGNMENTS_INVALID';
 WHEN 'duplicate_pairs' THEN d:=jsonb_set(d,'{pairs,1,pairId}',d#>'{pairs,0,pairId}'); e:='PAIRING_INVALID';
 WHEN 'duplicate_members' THEN d:=jsonb_set(d,'{pairs,1,memberIds,0}',d#>'{pairs,0,memberIds,0}'); e:='PAIRING_INVALID';
 WHEN 'duplicate_selected' THEN d:=jsonb_set(d,'{participants,memberIds,1}',d#>'{participants,memberIds,0}'); e:='MEMBER_NOT_ACTIVE_IN_GROUP'; s:='23503';
 WHEN 'stale_revision' THEN e:='SETUP_REVISION_CONFLICT'; s:='PH409';
 WHEN 'stale_fingerprint' THEN e:='DRAW_FINGERPRINT_MISMATCH'; s:='PH409'; ELSE NULL; END CASE;
 IF c.label~'_(missing|null|scalar)$' THEN
 path:=CASE WHEN c.label LIKE 'pair_members_%' THEN ARRAY['pairs','0','memberIds'] WHEN c.label LIKE 'pairs_%' THEN ARRAY['pairs'] WHEN c.label LIKE 'selected_%' THEN ARRAY['participants','memberIds'] ELSE ARRAY['draw','assignments'] END;
 IF c.label LIKE '%missing' THEN d:=d #- path; ELSE d:=jsonb_set(d,path,CASE WHEN c.label LIKE '%null' THEN 'null'::jsonb ELSE '42'::jsonb END); END IF;
 e:=CASE WHEN c.label LIKE 'pair_members_%' THEN 'PAIRING_INVALID' WHEN (c.label LIKE 'pairs_%' OR c.label LIKE 'selected_%') AND c.label NOT LIKE '%missing' THEN 'FINALIZE_DRAFT_INVALID' ELSE 'INTERNAL_DOUBLES_GROUP_KNOCKOUT_INVALID' END;
 END IF;
 key:='qa098-'||txid_current()||'-'||c.label;
 BEGIN
 IF c.label<>'persisted' THEN UPDATE public.tournament_divisions SET setup_draft=d WHERE group_id=19 AND tournament_id=196 AND id=180; END IF;
 BEGIN
 resp:=public.finalize_internal_doubles_group_knockout_v3(19,196,180,CASE WHEN c.label='stale_revision' THEN 6 ELSE 7 END,key,CASE WHEN c.label='stale_fingerprint' THEN repeat('0',64) ELSE fp END);
 EXCEPTION WHEN OTHERS THEN
 GET STACKED DIAGNOSTICS got=MESSAGE_TEXT,gs=RETURNED_SQLSTATE;
 IF e IS NULL OR got<>e OR gs<>s THEN RAISE EXCEPTION 'QA098 % expected %/% got %/%',c.label,e,s,got,gs; END IF;
 RAISE EXCEPTION USING ERRCODE='Z0980',MESSAGE='QA098 sentinel';
 END;
 IF e IS NOT NULL THEN RAISE EXCEPTION 'QA098 unexpected success %',c.label; END IF;
 want:=a*(a-1)/2+(n-a)*(n-a-1)/2;
 ASSERT resp->>'finalize_version'='v3' AND resp->>'success'='true' AND (resp->>'setup_revision')::int=8 AND (resp->>'group_fixtures')::int=want,'success counts';
 ASSERT (SELECT setup_revision=8 AND roster_lock_status='locked' AND setup_draft->>'state'='finalized' AND setup_draft#>>'{draw,status}'='locked' AND ((setup_draft-'state'-'finalizedAt') #- '{draw,status}')=((d-'state'-'finalizedAt') #- '{draw,status}') FROM public.tournament_divisions WHERE group_id=19 AND id=180),'aggregate preserved';
 ASSERT (SELECT count(*) FROM public.tournament_stages WHERE group_id=19 AND division_id=180)=2,'stages';
 ASSERT (SELECT count(*) FROM public.tournament_pairs WHERE group_id=19 AND division_id=180)=n,'pairs';
 ASSERT (SELECT count(*) FROM public.tournament_entries WHERE group_id=19 AND division_id=180)=n,'entries';
 ASSERT (SELECT count(*) FROM public.tournament_pair_members m JOIN public.tournament_pairs p ON p.id=m.pair_id WHERE m.group_id=19 AND p.division_id=180)=2*n,'memberships';
 ASSERT (SELECT count(*) FROM public.tournament_matches WHERE group_id=19 AND stage_id=(resp->>'group_stage_id')::bigint)=want,'fixtures';
 ASSERT (SELECT count(*) FROM public.tournament_stage_transitions WHERE group_id=19 AND division_id=180)=CASE WHEN resp#>>'{matches,BRONZE}' IS NULL THEN 6 ELSE 8 END,'transitions';
 ASSERT (SELECT config->'round_scoring' FROM public.tournament_stages WHERE group_id=19 AND id=(resp->>'group_stage_id')::bigint)=coalesce(d#>'{format,config,roundScoring,group}','{}'::jsonb),'group scoring';
 ASSERT (SELECT config->'round_scoring' FROM public.tournament_stages WHERE group_id=19 AND id=(resp->>'knockout_stage_id')::bigint)=coalesce(d#>'{format,config,roundScoring,knockout}','{}'::jsonb),'knockout scoring';
 prior:=pg_temp.snap(); replay:=public.finalize_internal_doubles_group_knockout_v3(19,196,180,7,key,fp);
 ASSERT replay->>'idempotent_replay'='true' AND replay->'matches'=resp->'matches' AND replay->>'setup_revision'='8' AND pg_temp.snap()=prior,'replay unchanged';
 BEGIN
 PERFORM public.finalize_internal_doubles_group_knockout_v3(19,196,180,8,key,fp); RAISE EXCEPTION 'QA098 reuse accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN ASSERT SQLERRM='IDEMPOTENCY_KEY_REUSED','precise reuse error'; END;
 ASSERT pg_temp.snap()=prior,'reuse unchanged';
 RAISE EXCEPTION USING ERRCODE='Z0980',MESSAGE='QA098 sentinel';
 EXCEPTION WHEN SQLSTATE 'Z0980' THEN ASSERT SQLERRM='QA098 sentinel','sentinel'; END;
 ASSERT pg_temp.snap()=base,'case leaked rows';
 INSERT INTO qa098_results VALUES(c.label,'PASS');
 END LOOP;
END $$;
SELECT label,result FROM qa098_results ORDER BY label;
ROLLBACK;
