UPDATE public.sessions s
SET results=jsonb_set(s.results,'{13}','"Camara"'::jsonb,false)
FROM public.stages st
WHERE s.stage_id=st.id AND st.key='brazil' AND s.type='qual' AND s.results->>'13'='Câmara';
