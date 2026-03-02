import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchProject, createProject, updateProject, uploadCsvFiles, uploadPipelineFiles, triggerScan, type CreateProjectInput, type Sector } from '../api/client';
import { PageHeader, PrimaryButton, SecondaryButton } from '../components/Shared';

const SECTORS: { value: Sector; label: string }[] = [
  { value: 'mining', label: 'Mining & Resources' },
  { value: 'environmental', label: 'Environmental & Sustainability' },
  { value: 'energy', label: 'Energy & Utilities' },
];

type DataSource = 'database' | 'csv' | 'powerbi' | 'tableau' | 'pipeline';

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', color: '#9CA3AF', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 20, marginBottom: 16 }}>
      <h3 style={{ color: 'white', fontSize: 14, fontWeight: 600, marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{title}</h3>
      {children}
    </div>
  );
}

const ACCEPTED_EXTENSIONS: Record<DataSource, string> = {
  database: '',
  csv: '.csv,.tsv,.xlsx,.xls',
  powerbi: '.pbit',
  tableau: '.twb,.twbx',
  pipeline: '.csv,.tsv,.json',
};

export function ProjectForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    name: '', sector: 'mining' as Sector,
    revenueAUD: 500000000, totalFTE: 2500, dataEngineers: 12,
    avgSalaryAUD: 185000, avgFTESalaryAUD: 125000,
    aiBudgetAUD: 2500000, csrdInScope: false, canonicalInvestmentAUD: 1350000,
    dbType: 'postgresql', dbHost: 'localhost', dbPort: 5432,
    dbName: '', dbUsername: '', dbPassword: '', dbSsl: false,
    dbSchemas: 'public',
  });

  const [dataSource, setDataSource] = useState<DataSource>('database');
  const [csvFiles, setCsvFiles] = useState<File[]>([]);
  const [pipelineType, setPipelineType] = useState<'stm' | 'dbt' | 'openlineage'>('stm');
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEdit && id) {
      fetchProject(id).then((p) => {
        setForm({
          name: p.name, sector: p.sector as Sector,
          revenueAUD: p.revenue_aud, totalFTE: p.total_fte,
          dataEngineers: p.data_engineers, avgSalaryAUD: p.avg_salary_aud,
          avgFTESalaryAUD: p.avg_fte_salary_aud, aiBudgetAUD: p.ai_budget_aud,
          csrdInScope: p.csrd_in_scope === 1,
          canonicalInvestmentAUD: p.canonical_investment_aud,
          dbType: p.db_type, dbHost: p.db_host ?? 'localhost',
          dbPort: p.db_port ?? 5432, dbName: p.db_name ?? '',
          dbUsername: p.db_username ?? '', dbPassword: '',
          dbSsl: p.db_ssl === 1, dbSchemas: p.db_schemas ?? 'public',
        });
      }).catch((err) => setFormError(err?.message ?? 'Failed to load project'));
    }
  }, [id, isEdit]);

  const update = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const allowedExts: Record<DataSource, string[]> = {
      database: [],
      csv: ['csv', 'tsv', 'xlsx', 'xls'],
      powerbi: ['pbit'],
      tableau: ['twb', 'twbx'],
      pipeline: ['csv', 'tsv', 'json'],
    };
    const valid = Array.from(incoming).filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      return ext && allowedExts[dataSource].includes(ext);
    });
    if (valid.length > 0) {
      setCsvFiles((prev) => [...prev, ...valid]);
    }
  }, [dataSource]);

  const removeFile = (index: number) => {
    setCsvFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleSave = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const input: CreateProjectInput = {
        name: form.name,
        sector: form.sector,
        revenueAUD: form.revenueAUD,
        totalFTE: form.totalFTE,
        dataEngineers: form.dataEngineers,
        avgSalaryAUD: form.avgSalaryAUD,
        avgFTESalaryAUD: form.avgFTESalaryAUD,
        aiBudgetAUD: form.aiBudgetAUD || undefined,
        csrdInScope: form.csrdInScope,
        canonicalInvestmentAUD: form.canonicalInvestmentAUD,
        database: dataSource === 'database' ? {
          type: form.dbType,
          host: form.dbHost || undefined,
          port: form.dbPort,
          database: form.dbName || undefined,
          username: form.dbUsername || undefined,
          password: form.dbPassword || undefined,
          ssl: form.dbSsl,
          schemas: form.dbSchemas.split(',').map((s) => s.trim()).filter(Boolean),
        } : undefined,
      };

      let projectId = id;
      if (isEdit && id) {
        await updateProject(id, input);
      } else {
        const created = await createProject(input);
        projectId = created.id;
      }

      // If file upload mode with files, upload and trigger scan
      if ((dataSource === 'csv' || dataSource === 'powerbi' || dataSource === 'tableau') && csvFiles.length > 0 && projectId) {
        setUploading(true);
        try {
          const result = await uploadCsvFiles(projectId, csvFiles);
          navigate(`/scans/${result.scanId}/progress`);
          return;
        } catch (err: any) {
          setFormError(err?.message ?? 'Upload failed');
        } finally {
          setUploading(false);
        }
      }

      // Pipeline mode: create a dry-run scan, then upload pipeline files
      if (dataSource === 'pipeline' && csvFiles.length > 0 && projectId) {
        setUploading(true);
        try {
          const scanResult = await triggerScan(projectId, true);
          const result = await uploadPipelineFiles(scanResult.scanId, csvFiles, pipelineType);
          navigate(`/scans/${scanResult.scanId}`);
          return;
        } catch (err: any) {
          setFormError(err?.message ?? 'Pipeline upload failed');
        } finally {
          setUploading(false);
        }
      }

      navigate('/projects');
    } catch (err: any) {
      setFormError(err?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = { width: '100%' };
  const halfGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };

  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
    background: active ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)',
    color: active ? '#10B981' : '#6B7280',
    outline: active ? '1px solid rgba(16,185,129,0.3)' : '1px solid transparent',
    transition: 'all 0.15s',
  });

  return (
    <div>
      <PageHeader title={isEdit ? 'Edit Project' : 'New Project'} />

      {formError && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 8, padding: '10px 16px', marginBottom: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ color: '#FCA5A5', fontSize: 13 }}>{formError}</span>
          <button onClick={() => setFormError(null)} style={{
            background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer',
            fontSize: 16, fontFamily: 'inherit', padding: '0 4px',
          }}>×</button>
        </div>
      )}

      <FormSection title="Organisation Details">
        <FormField label="Project Name">
          <input style={inputStyle} value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Acme Mining Warehouse" />
        </FormField>
        <FormField label="Sector">
          <select style={inputStyle} value={form.sector} onChange={(e) => update('sector', e.target.value)}>
            {SECTORS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </FormField>
        <div style={halfGrid}>
          <FormField label="Revenue (AUD)">
            <input style={inputStyle} type="number" value={form.revenueAUD} onChange={(e) => update('revenueAUD', +e.target.value)} />
          </FormField>
          <FormField label="Total FTE">
            <input style={inputStyle} type="number" value={form.totalFTE} onChange={(e) => update('totalFTE', +e.target.value)} />
          </FormField>
          <FormField label="Data Engineers">
            <input style={inputStyle} type="number" value={form.dataEngineers} onChange={(e) => update('dataEngineers', +e.target.value)} />
          </FormField>
          <FormField label="Avg Data Eng Salary (AUD)">
            <input style={inputStyle} type="number" value={form.avgSalaryAUD} onChange={(e) => update('avgSalaryAUD', +e.target.value)} />
          </FormField>
          <FormField label="Avg FTE Salary (AUD)">
            <input style={inputStyle} type="number" value={form.avgFTESalaryAUD} onChange={(e) => update('avgFTESalaryAUD', +e.target.value)} />
          </FormField>
          <FormField label="AI/ML Budget (AUD)">
            <input style={inputStyle} type="number" value={form.aiBudgetAUD} onChange={(e) => update('aiBudgetAUD', +e.target.value)} />
          </FormField>
          <FormField label="Canonical Investment (AUD)">
            <input style={inputStyle} type="number" value={form.canonicalInvestmentAUD} onChange={(e) => update('canonicalInvestmentAUD', +e.target.value)} />
          </FormField>
        </div>
        <FormField label="">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#D1D5DB', fontSize: 13 }}>
            <input type="checkbox" checked={form.csrdInScope} onChange={(e) => update('csrdInScope', e.target.checked)} />
            CSRD in scope
          </label>
        </FormField>
      </FormSection>

      {/* Data Source Toggle */}
      <FormSection title="Data Source">
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button style={toggleBtnStyle(dataSource === 'database')} onClick={() => { setDataSource('database'); setCsvFiles([]); }}>
            Database Connection
          </button>
          <button style={toggleBtnStyle(dataSource === 'csv')} onClick={() => { setDataSource('csv'); setCsvFiles([]); }}>
            CSV / Excel Upload
          </button>
          <button style={toggleBtnStyle(dataSource === 'powerbi')} onClick={() => { setDataSource('powerbi'); setCsvFiles([]); }}>
            Power BI Template
          </button>
          <button style={toggleBtnStyle(dataSource === 'tableau')} onClick={() => { setDataSource('tableau'); setCsvFiles([]); }}>
            Tableau Workbook
          </button>
          <button style={toggleBtnStyle(dataSource === 'pipeline')} onClick={() => { setDataSource('pipeline'); setCsvFiles([]); }}>
            Pipeline / ETL
          </button>
        </div>

        {dataSource === 'database' && (
          <>
            <div style={halfGrid}>
              <FormField label="Database Type">
                <select style={inputStyle} value={form.dbType} onChange={(e) => update('dbType', e.target.value)}>
                  <option value="postgresql">PostgreSQL</option>
                  <option value="mysql">MySQL</option>
                  <option value="mssql">SQL Server</option>
                </select>
              </FormField>
              <FormField label="Host">
                <input style={inputStyle} value={form.dbHost} onChange={(e) => update('dbHost', e.target.value)} />
              </FormField>
              <FormField label="Port">
                <input style={inputStyle} type="number" value={form.dbPort} onChange={(e) => update('dbPort', +e.target.value)} />
              </FormField>
              <FormField label="Database Name">
                <input style={inputStyle} value={form.dbName} onChange={(e) => update('dbName', e.target.value)} />
              </FormField>
              <FormField label="Username">
                <input style={inputStyle} value={form.dbUsername} onChange={(e) => update('dbUsername', e.target.value)} />
              </FormField>
              <FormField label="Password">
                <input style={inputStyle} type="password" value={form.dbPassword} onChange={(e) => update('dbPassword', e.target.value)} placeholder={isEdit ? '••••••••' : ''} />
              </FormField>
            </div>
            <FormField label="Schemas (comma-separated)">
              <input style={inputStyle} value={form.dbSchemas} onChange={(e) => update('dbSchemas', e.target.value)} placeholder="public, staging, analytics" />
            </FormField>
            <FormField label="">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#D1D5DB', fontSize: 13 }}>
                <input type="checkbox" checked={form.dbSsl} onChange={(e) => update('dbSsl', e.target.checked)} />
                SSL connection
              </label>
            </FormField>
          </>
        )}

        {(dataSource === 'csv' || dataSource === 'powerbi' || dataSource === 'tableau' || dataSource === 'pipeline') && (
          <>
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? '#10B981' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 8, padding: 32, textAlign: 'center', cursor: 'pointer',
                background: dragOver ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)',
                transition: 'all 0.15s', marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 28, opacity: 0.3, marginBottom: 8 }}>+</div>
              <div style={{ color: '#D1D5DB', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                {dataSource === 'csv' ? 'Drop CSV or Excel files here'
                  : dataSource === 'powerbi' ? 'Drop Power BI template (.pbit) here'
                  : dataSource === 'tableau' ? 'Drop Tableau workbook (.twb, .twbx) here'
                  : 'Drop pipeline mapping files here'}
              </div>
              <div style={{ color: '#6B7280', fontSize: 11 }}>
                or click to browse  &middot;  {ACCEPTED_EXTENSIONS[dataSource]}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS[dataSource]}
                multiple={dataSource === 'csv' || dataSource === 'pipeline'}
                style={{ display: 'none' }}
                onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
              />
            </div>

            {/* File list */}
            {csvFiles.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {csvFiles.map((f, i) => (
                  <div key={`${f.name}-${i}`} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 4, marginBottom: 4,
                  }}>
                    <span style={{ color: '#D1D5DB', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                      {f.name}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#6B7280', fontSize: 11 }}>
                        {(f.size / 1024).toFixed(0)} KB
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                        style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', padding: '0 4px' }}
                      >
                        x
                      </button>
                    </div>
                  </div>
                ))}
                <div style={{ color: '#6B7280', fontSize: 11, marginTop: 4 }}>
                  {csvFiles.length} file{csvFiles.length !== 1 ? 's' : ''} selected
                  {dataSource === 'csv' ? ' \u00b7 Each file becomes a table' : ''}
                </div>
              </div>
            )}

            <div style={{ color: '#6B7280', fontSize: 11, marginTop: 12, lineHeight: 1.6 }}>
              {dataSource === 'csv'
                ? 'Each file is treated as one database table. Column types are inferred automatically. Foreign keys are detected from column name patterns (_id, _key, _code, _ref).'
                : dataSource === 'powerbi'
                ? 'Upload a Power BI Template (.pbit) file. Tables, columns, measures, and relationships are extracted from the data model. Save your .pbix as a template via File > Save As > Power BI Template.'
                : dataSource === 'tableau'
                ? 'Upload a Tableau Workbook (.twb) or Packaged Workbook (.twbx). Datasources, columns, calculated fields, and joins are extracted from the workbook XML.'
                : 'Upload pipeline mapping files. Mappings are analysed for semantic drift, undocumented transforms, and lineage gaps.'}
            </div>

            {dataSource === 'pipeline' && (
              <div style={{ marginTop: 12 }}>
                <div style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  Pipeline Format
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([['stm', 'STM (CSV)'], ['dbt', 'dbt Manifest'], ['openlineage', 'OpenLineage']] as const).map(([val, label]) => (
                    <button key={val} onClick={() => setPipelineType(val)} style={{
                      flex: 1, padding: '8px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                      background: pipelineType === val ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.04)',
                      color: pipelineType === val ? '#818CF8' : '#6B7280',
                      outline: pipelineType === val ? '1px solid rgba(129,140,248,0.3)' : '1px solid transparent',
                      transition: 'all 0.15s',
                    }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </FormSection>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <SecondaryButton onClick={() => navigate('/projects')}>Cancel</SecondaryButton>
        <PrimaryButton onClick={handleSave}>
          {uploading ? 'Uploading...' : saving ? 'Saving...' : (dataSource === 'csv' || dataSource === 'powerbi' || dataSource === 'tableau' || dataSource === 'pipeline') && csvFiles.length > 0
            ? (isEdit ? 'Save & Scan' : 'Create & Scan')
            : (isEdit ? 'Save Changes' : 'Create Project')}
        </PrimaryButton>
      </div>
    </div>
  );
}
