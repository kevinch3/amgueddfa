-- Promote one account to admin. Run in the Supabase SQL editor (or psql) with
-- the email passed as a variable, e.g.  psql ... -v email=you@example.com -f scripts/make_admin.sql
-- No real email is ever committed here.
update profiles set role='admin' where id = (select id from auth.users where email = :'email');
