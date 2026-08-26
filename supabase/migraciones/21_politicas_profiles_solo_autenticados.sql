-- Las politicas de public.profiles se crearon para el rol `public`, que
-- incluye a `anon`. Todas dependen de auth.uid() o del rol del usuario, asi
-- que para un anonimo nunca pueden dar verdadero: lo unico que lograban era
-- hacerle evaluar current_user_role(), que no tiene permiso de ejecutar.
--
-- El sintoma: una consulta anonima a profiles devolvia
-- "permission denied for function current_user_role" en vez de cero filas.
-- Seguia sin exponer datos, pero filtra que existe esa funcion y confunde.
--
-- Acotandolas a `authenticated`, un anonimo simplemente no tiene ninguna
-- politica aplicable y RLS le niega sin ejecutar nada.
alter policy profiles_select_own            on public.profiles to authenticated;
alter policy profiles_select_by_role        on public.profiles to authenticated;
alter policy profiles_update_own            on public.profiles to authenticated;
alter policy profiles_admin_update          on public.profiles to authenticated;
alter policy profiles_delete_superadmin_only on public.profiles to authenticated;

-- Ya no hace falta que anon pueda ejecutarlas.
revoke execute on function public.can_view_role(public.user_role) from anon;
revoke execute on function public.can_manage_role(public.user_role) from anon;
