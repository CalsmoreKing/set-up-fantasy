DO $$ DECLARE v_updated integer; BEGIN
WITH updates(stage_key,results) AS (VALUES
  ('australia','{"1":"Russell","2":"Antonelli","3":"Hadjar","4":"Leclerc","5":"Piastri","6":"Norris","7":"Hamilton","8":"Lawson","9":"Lindblad","10":"Bortoleto","11":"Hülkenberg","12":"Bearman","13":"Ocon","14":"Gasly","15":"Albon","16":"Colapinto","17":"Alonso","18":"Pérez","19":"Bottas"}'::jsonb),
  ('china','{"1":"Antonelli","2":"Russell","3":"Hamilton","4":"Leclerc","5":"Piastri","6":"Norris","7":"Gasly","8":"Verstappen","9":"Hadjar","10":"Bearman","11":"Hülkenberg","12":"Colapinto","13":"Ocon","14":"Lawson","15":"Lindblad","16":"Bortoleto","17":"Sainz","18":"Albon","19":"Alonso","20":"Bottas","21":"Stroll","22":"Pérez"}'::jsonb),
  ('japan','{"1":"Antonelli","2":"Russell","3":"Piastri","4":"Leclerc","5":"Norris","6":"Hamilton","7":"Gasly","8":"Hadjar","9":"Bortoleto","10":"Lindblad","11":"Verstappen","12":"Ocon","13":"Hülkenberg","14":"Lawson","15":"Colapinto","16":"Sainz","17":"Albon","18":"Bearman","19":"Pérez","20":"Bottas","21":"Alonso","22":"Stroll"}'::jsonb),
  ('miami','{"1":"Antonelli","2":"Verstappen","3":"Leclerc","4":"Norris","5":"Russell","6":"Hamilton","7":"Piastri","8":"Colapinto","9":"Gasly","10":"Hülkenberg","11":"Lawson","12":"Bearman","13":"Sainz","14":"Ocon","15":"Albon","16":"Lindblad","17":"Alonso","18":"Stroll","19":"Bottas","20":"Pérez","21":"Bortoleto"}'::jsonb)
)
UPDATE public.sessions s SET results=u.results FROM public.stages st JOIN updates u ON u.stage_key=st.key
WHERE s.stage_id=st.id AND s.type='qual';
GET DIAGNOSTICS v_updated=ROW_COUNT;
IF v_updated<>4 THEN RAISE EXCEPTION 'Expected 4 legacy qualifying sessions, got %',v_updated; END IF;
END $$;
