DO $$
DECLARE v_updated integer;
BEGIN
  WITH updates(stage_key,session_type,results,ov_pilot) AS (VALUES
    ('azerbaijan','qual','{"1":"Russell","2":"Leclerc","3":"Piastri","4":"Hadjar","5":"Norris","6":"Hamilton","7":"Gasly","8":"Verstappen","9":"Sainz","10":"Colapinto","11":"Bearman","12":"Lawson","13":"Albon","14":"Ocon","15":"Lindblad","16":"Antonelli","17":"Bortoleto","18":"Hülkenberg","19":"Alonso","20":"Pérez","21":"Stroll","22":"Bottas"}'::jsonb,NULL::text),
    ('brazil','qual','{"1":"Norris","2":"Russell","3":"Antonelli","4":"Leclerc","5":"Lawson","6":"Hülkenberg","7":"Hadjar","8":"Bearman","9":"Alonso","10":"Albon","11":"Hamilton","12":"Piastri","13":"Câmara","14":"Lindblad","15":"Sainz","16":"Verstappen","17":"Colapinto","18":"Gasly","19":"Stroll","20":"Bottas","21":"Pérez","22":"Bortoleto"}'::jsonb,NULL::text),
    ('mexico','qual','{"1":"Hamilton","2":"Russell","3":"Leclerc","4":"Verstappen","5":"Antonelli","6":"Norris","7":"Hadjar","8":"Lindblad","9":"Gasly","10":"Hülkenberg","11":"Colapinto","12":"Piastri","13":"Bortoleto","14":"Bearman","15":"Sainz","16":"Albon","17":"Alonso","18":"Hirakawa","19":"Stroll","20":"Pérez","21":"Bottas"}'::jsonb,NULL::text),
    ('netherlands','qual','{"1":"Norris","2":"Russell","3":"Antonelli","4":"Piastri","5":"Hamilton","6":"Leclerc","7":"Verstappen","8":"Lawson","9":"Bortoleto","10":"Lindblad","11":"Gasly","12":"Tsunoda","13":"Hülkenberg","14":"Colapinto","15":"Ocon","16":"Albon","17":"Sainz","18":"Alonso","19":"Stroll","20":"Bearman","21":"Bottas","22":"Pérez"}'::jsonb,NULL::text),
    ('mexico','race','{"1":"Verstappen","2":"Hamilton","3":"Antonelli","4":"Leclerc","5":"Norris","6":"Russell","7":"Lawson","8":"Bortoleto","9":"Hadjar","10":"Hirakawa"}'::jsonb,NULL::text),
    ('australia','race',NULL,'Verstappen'::text),
    ('china','race',NULL,'Sainz'::text),
    ('japan','race',NULL,'Lawson'::text),
    ('miami','race',NULL,'Bortoleto'::text),
    ('canada','race',NULL,'Stroll'::text),
    ('monaco','race',NULL,'Alonso'::text),
    ('spain','race',NULL,'Gasly'::text),
    ('austria','race',NULL,'Verstappen, Piastri, Alonso'::text),
    ('singapore','race',NULL,'Hadjar'::text)
  )
  UPDATE public.sessions s SET
    results=COALESCE(u.results,s.results),
    ov_pilot=COALESCE(u.ov_pilot,s.ov_pilot)
  FROM public.stages st JOIN updates u ON u.stage_key=st.key
  WHERE s.stage_id=st.id AND s.type=u.session_type;
  GET DIAGNOSTICS v_updated=ROW_COUNT;
  IF v_updated <> 14 THEN RAISE EXCEPTION 'Expected to correct 14 sessions but updated %',v_updated; END IF;
END $$;