-- Helgpass ska inte skapas eller ligga kvar som bemanningsbehov.
-- Vi tar bara bort otilldelade helgpass så inga aktiva bokningar raderas av misstag.
delete from public.vikariepass
where extract(isodow from datum::date) in (6, 7)
  and vikarie_id is null
  and riktad_till_vikarie_id is null;
