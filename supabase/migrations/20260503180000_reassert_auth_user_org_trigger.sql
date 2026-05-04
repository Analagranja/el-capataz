-- Asegura que el alta en auth.users dispare org + membresía + perfil.
-- Si solo se aplicó SQL parcial o se borró el trigger, el usuario existía en Auth sin filas en organization_members.
DROP TRIGGER IF EXISTS on_auth_user_created_setup ON auth.users;

CREATE TRIGGER on_auth_user_created_setup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user_after_insert();
