-- ATS-0018 slice-8c: retention taraması indexleri (created_at < cutoff sorguları)
CREATE INDEX transcript_tenant_created_idx      ON transcript (tenant_id, created_at);
CREATE INDEX citation_tenant_created_idx        ON citation (tenant_id, created_at);
CREATE INDEX export_artifact_tenant_created_idx ON export_artifact (tenant_id, created_at);
