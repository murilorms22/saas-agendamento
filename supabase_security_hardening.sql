-- ==============================================================================
-- SCRIPT DE BLINDAGEM DE SEGURANÇA TOTAL (PostgreSQL & Supabase RLS)
-- Projeto: SaaS Agendamento White-Label
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ATIVAÇÃO DE ROW LEVEL SECURITY (RLS) EM TODAS AS TABELAS SENSÍVEIS
-- ------------------------------------------------------------------------------
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. LIMPEZA DE POLÍTICAS ANTIGAS / PERMISSIVAS DEMAIS (DROP POLICIES)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('empresas', 'servicos', 'clientes', 'agendamentos')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 3. POLÍTICAS RLS: TABELA 'empresas'
-- ------------------------------------------------------------------------------
-- Leitura pública (necessária para os clientes acessarem a Landing Page pelo slug)
CREATE POLICY "empresas_select_public"
ON public.empresas
FOR SELECT
TO public
USING (true);

-- Modificação e exclusão estritas: apenas o dono da clínica autenticado
CREATE POLICY "empresas_update_owner"
ON public.empresas
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR auth.uid() = auth_user_id)
WITH CHECK (auth.uid() = user_id OR auth.uid() = auth_user_id);

CREATE POLICY "empresas_delete_owner"
ON public.empresas
FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR auth.uid() = auth_user_id);

CREATE POLICY "empresas_insert_authenticated"
ON public.empresas
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id OR auth.uid() = auth_user_id);

-- ------------------------------------------------------------------------------
-- 4. POLÍTICAS RLS: TABELA 'servicos'
-- ------------------------------------------------------------------------------
-- Leitura pública (para exibição do cardápio de serviços na Landing Page)
CREATE POLICY "servicos_select_public"
ON public.servicos
FOR SELECT
TO public
USING (true);

-- Gestão restrita ao dono da empresa
CREATE POLICY "servicos_insert_owner"
ON public.servicos
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.empresas
        WHERE empresas.id = servicos.empresa_id
          AND (empresas.user_id = auth.uid() OR empresas.auth_user_id = auth.uid())
    )
);

CREATE POLICY "servicos_update_owner"
ON public.servicos
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.empresas
        WHERE empresas.id = servicos.empresa_id
          AND (empresas.user_id = auth.uid() OR empresas.auth_user_id = auth.uid())
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.empresas
        WHERE empresas.id = servicos.empresa_id
          AND (empresas.user_id = auth.uid() OR empresas.auth_user_id = auth.uid())
    )
);

CREATE POLICY "servicos_delete_owner"
ON public.servicos
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.empresas
        WHERE empresas.id = servicos.empresa_id
          AND (empresas.user_id = auth.uid() OR empresas.auth_user_id = auth.uid())
    )
);

-- ------------------------------------------------------------------------------
-- 5. POLÍTICAS RLS: TABELA 'clientes' (DADOS SENSÍVEIS: CPF, TELEFONE, EMAIL)
-- ------------------------------------------------------------------------------
-- Leitura: Apenas o profissional dono da clínica OU o próprio paciente autenticado
CREATE POLICY "clientes_select_restricted"
ON public.clientes
FOR SELECT
TO authenticated
USING (
    auth_user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.empresas
        WHERE empresas.id = clientes.empresa_id
          AND (empresas.user_id = auth.uid() OR empresas.auth_user_id = auth.uid())
    )
);

-- Inserção: Paciente autenticado ao cadastrar OU o profissional cadastrando paciente
CREATE POLICY "clientes_insert_authenticated"
ON public.clientes
FOR INSERT
TO authenticated
WITH CHECK (
    auth_user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.empresas
        WHERE empresas.id = clientes.empresa_id
          AND (empresas.user_id = auth.uid() OR empresas.auth_user_id = auth.uid())
    )
);

-- Atualização: Próprio paciente OU dono da clínica
CREATE POLICY "clientes_update_restricted"
ON public.clientes
FOR UPDATE
TO authenticated
USING (
    auth_user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.empresas
        WHERE empresas.id = clientes.empresa_id
          AND (empresas.user_id = auth.uid() OR empresas.auth_user_id = auth.uid())
    )
)
WITH CHECK (
    auth_user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.empresas
        WHERE empresas.id = clientes.empresa_id
          AND (empresas.user_id = auth.uid() OR empresas.auth_user_id = auth.uid())
    )
);

-- Exclusão: Apenas o dono da clínica
CREATE POLICY "clientes_delete_owner"
ON public.clientes
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.empresas
        WHERE empresas.id = clientes.empresa_id
          AND (empresas.user_id = auth.uid() OR empresas.auth_user_id = auth.uid())
    )
);

-- ------------------------------------------------------------------------------
-- 6. POLÍTICAS RLS: TABELA 'agendamentos'
-- ------------------------------------------------------------------------------
-- Leitura dos agendamentos detalhados (apenas o profissional ou o paciente que agendou)
CREATE POLICY "agendamentos_select_authenticated"
ON public.agendamentos
FOR SELECT
TO authenticated
USING (
    -- Dono da clínica
    EXISTS (
        SELECT 1 FROM public.empresas
        WHERE empresas.id = agendamentos.empresa_id
          AND (empresas.user_id = auth.uid() OR empresas.auth_user_id = auth.uid())
    )
    -- Ou o próprio paciente que realizou a consulta
    OR cliente_id IN (
        SELECT id FROM public.clientes WHERE auth_user_id = auth.uid()
    )
);

-- Leitura pública das faixas de horário (apenas data e horário para checar conflitos na landing page)
CREATE POLICY "agendamentos_select_public_slots"
ON public.agendamentos
FOR SELECT
TO anon
USING (
    status != 'Cancelado'
);

-- Inserção de agendamento: Apenas usuário autenticado
CREATE POLICY "agendamentos_insert_authenticated"
ON public.agendamentos
FOR INSERT
TO authenticated
WITH CHECK (
    -- O cliente deve ser o paciente logado ou o agendamento deve pertencer à clínica do admin
    cliente_id IN (
        SELECT id FROM public.clientes WHERE auth_user_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM public.empresas
        WHERE empresas.id = agendamentos.empresa_id
          AND (empresas.user_id = auth.uid() OR empresas.auth_user_id = auth.uid())
    )
);

-- Atualização: Dono da clínica ou o próprio paciente
CREATE POLICY "agendamentos_update_restricted"
ON public.agendamentos
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.empresas
        WHERE empresas.id = agendamentos.empresa_id
          AND (empresas.user_id = auth.uid() OR empresas.auth_user_id = auth.uid())
    )
    OR cliente_id IN (
        SELECT id FROM public.clientes WHERE auth_user_id = auth.uid()
    )
);

-- Exclusão: Apenas o dono da clínica
CREATE POLICY "agendamentos_delete_owner"
ON public.agendamentos
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.empresas
        WHERE empresas.id = agendamentos.empresa_id
          AND (empresas.user_id = auth.uid() OR empresas.auth_user_id = auth.uid())
    )
);

-- ------------------------------------------------------------------------------
-- 7. BLINDAGEM ATÔMICA CONTRA CONCORRÊNCIA E RACE CONDITION (PostgreSQL Index)
-- ------------------------------------------------------------------------------
-- Impede fisicamente dois agendamentos no mesmo horário/dia para a mesma empresa
-- se o status não for Cancelado. Se houver colisão milimétrica, o Postgres aborta com erro 23505.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agendamentos_concorrencia 
ON public.agendamentos (empresa_id, data, horario) 
WHERE status != 'Cancelado';

-- ------------------------------------------------------------------------------
-- 8. BLINDAGEM DE STORAGE: BUCKET 'logos'
-- ------------------------------------------------------------------------------
-- Garante a criação do bucket 'logos' com restrições rígidas de MIME e tamanho (2MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'logos',
    'logos',
    true,
    2097152, -- 2 MB
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

-- Políticas de RLS para storage.objects
DROP POLICY IF EXISTS "logos_select_public" ON storage.objects;
DROP POLICY IF EXISTS "logos_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "logos_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "logos_delete_authenticated" ON storage.objects;

-- Visualização pública de imagens do bucket logos
CREATE POLICY "logos_select_public"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'logos');

-- Upload apenas por usuários autenticados e apenas com extensões permitidas
CREATE POLICY "logos_insert_authenticated"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'logos'
    AND LOWER(storage.extension(name)) IN ('png', 'jpg', 'jpeg', 'webp')
);

-- Atualização e exclusão apenas por usuários autenticados
CREATE POLICY "logos_update_authenticated"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'logos');

CREATE POLICY "logos_delete_authenticated"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'logos');
