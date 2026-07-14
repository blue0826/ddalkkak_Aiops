-- ----------------------------------------------------
-- ddalkkak_Aiops PostgreSQL Row-Level Security (RLS) 설정
-- ----------------------------------------------------

-- 1. tenant 테이블 RLS 설정
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant;
CREATE POLICY tenant_isolation ON tenant
    FOR ALL
    USING (
        id = current_setting('app.current_tenant_id', true) 
        OR current_setting('app.current_user_role', true) = 'SYSTEM_ADMIN'
    );

-- 2. user 테이블 RLS 설정
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_isolation ON "user";
CREATE POLICY user_isolation ON "user"
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', true) 
        OR current_setting('app.current_user_role', true) = 'SYSTEM_ADMIN'
    );

-- 3. cloud_credential 테이블 RLS 설정
ALTER TABLE cloud_credential ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS credential_isolation ON cloud_credential;
CREATE POLICY credential_isolation ON cloud_credential
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', true) 
        OR current_setting('app.current_user_role', true) = 'SYSTEM_ADMIN'
    );

-- 4. alert_rule 테이블 RLS 설정
ALTER TABLE alert_rule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alert_rule_isolation ON alert_rule;
CREATE POLICY alert_rule_isolation ON alert_rule
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', true) 
        OR current_setting('app.current_user_role', true) = 'SYSTEM_ADMIN'
    );

-- 5. audit_log 테이블 RLS 설정
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_isolation ON audit_log;
CREATE POLICY audit_log_isolation ON audit_log
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', true) 
        OR current_setting('app.current_user_role', true) = 'SYSTEM_ADMIN'
    );
