import { CheckCircleFilled, CloudUploadOutlined, DownloadOutlined, FileTextOutlined, InboxOutlined, ReloadOutlined, WarningFilled } from '@ant-design/icons';
import { App, Button, Card, Col, Progress, Row, Select, Space, Steps, Table, Tag, Typography, Upload } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload/interface';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { StatusTag } from '../components/StatusTag';
import type { ImportJob, ImportValidation } from '../types';

const { Dragger } = Upload;

const typeLabels: Record<ImportJob['type'], string> = {
  areas: '校园地点',
  merchants: '商家',
  menu_items: '菜品 / 套餐',
};

export function ImportsPage() {
  const { message } = App.useApp();
  const [type, setType] = useState<ImportJob['type']>('merchants');
  const [file, setFile] = useState<File>();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [validation, setValidation] = useState<ImportValidation>();
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      setJobs(await adminApi.importJobs());
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导入记录加载失败');
    } finally {
      setJobsLoading(false);
    }
  }, [message]);

  useEffect(() => { void loadJobs(); }, [loadJobs]);

  const currentStep = useMemo(() => validation ? 2 : file ? 1 : 0, [file, validation]);

  const validate = async () => {
    if (!file) return message.warning('请先选择 CSV 文件');
    setValidating(true);
    try {
      const result = await adminApi.validateImport(file, type);
      setValidation(result);
      result.invalid ? message.warning(`预校验完成，发现 ${result.invalid} 条问题`) : message.success('预校验通过，可以开始导入');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '文件校验失败');
    } finally {
      setValidating(false);
    }
  };

  const startImport = async () => {
    if (!file || !validation) return;
    setImporting(true);
    try {
      const job = await adminApi.startImport(file, type, validation);
      message.success(`导入完成：成功 ${job.success} 行，失败 ${job.failed} 行`);
      setFile(undefined);
      setFileList([]);
      setValidation(undefined);
      await loadJobs();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const rows: Record<ImportJob['type'], string> = {
      areas: 'campus_id,parent_id,name,level,sort_order\n00000000-0000-0000-0000-000000000001,,北门商业街,1,10',
      merchants: 'campus_id,area_id,category_id,name,description,address,latitude,longitude,gcj02_latitude,gcj02_longitude,price_level,business_hours\n00000000-0000-0000-0000-000000000001,,,示例商家,主营面食,北门 1 号,31.230400,121.473700,,,2,10:00-22:00',
      menu_items: 'merchant_id,category_id,name,description,item_type,price_cents,image_url,tags\n请替换为商家ID,,招牌拌面,微辣大份,dish,1500,/images/dish-placeholder.webp,微辣|人气',
    };
    const url = URL.createObjectURL(new Blob([`\uFEFF${rows[type]}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${type}-template.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const columns: ColumnsType<ImportJob> = [
    { title: '文件', key: 'file', width: 250, render: (_, record) => <div className="table-primary"><strong><FileTextOutlined /> {record.fileName}</strong><span>{record.id}</span></div> },
    { title: '数据类型', dataIndex: 'type', width: 120, render: (value: ImportJob['type']) => typeLabels[value] },
    { title: '状态', dataIndex: 'status', width: 100, render: (value) => <StatusTag status={value} /> },
    { title: '进度', key: 'progress', width: 180, render: (_, record) => <Progress percent={record.progress} size="small" status={record.status === 'failed' ? 'exception' : undefined} /> },
    { title: '结果', key: 'result', width: 150, render: (_, record) => <Space><span className="success-text">成功 {record.success}</span>{record.failed > 0 && <span className="error-text">失败 {record.failed}</span>}</Space> },
    { title: '操作人', dataIndex: 'createdBy', width: 100 },
    { title: '创建时间', dataIndex: 'createdAt', width: 160 },
    { title: '操作', key: 'action', width: 110, render: (_, record) => record.failed ? <Button type="link" size="small" onClick={() => message.info('错误报告将在真实后端模式下生成下载链接')}>错误报告</Button> : '-' },
  ];

  return (
    <div>
      <PageHeader
        title="CSV 数据导入"
        description="批量导入校园地点、商家和菜品；执行前先预校验，避免脏数据入库"
        extra={<Button icon={<DownloadOutlined />} onClick={downloadTemplate}>下载当前模板</Button>}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Card title="新建导入任务" bordered={false}>
            <Steps current={currentStep} size="small" items={[{ title: '选择文件' }, { title: '预校验' }, { title: '确认导入' }]} className="import-steps" />
            <div className="import-type-row"><Typography.Text strong>数据类型</Typography.Text><Select value={type} onChange={(value) => { setType(value); setValidation(undefined); }} options={Object.entries(typeLabels).map(([value, label]) => ({ value, label }))} style={{ width: 200 }} /></div>
            <Dragger
              accept=".csv,text/csv"
              maxCount={1}
              fileList={fileList}
              beforeUpload={(selectedFile) => {
                setFile(selectedFile);
                setFileList([selectedFile]);
                setValidation(undefined);
                return false;
              }}
              onRemove={() => { setFile(undefined); setFileList([]); setValidation(undefined); }}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">点击或拖拽 CSV 文件到此区域</p>
              <p className="ant-upload-hint">文件需使用 UTF-8 编码，建议单次不超过 5,000 行</p>
            </Dragger>
            <div className="import-actions">
              <Button icon={<CloudUploadOutlined />} loading={validating} disabled={!file} onClick={() => void validate()}>开始预校验</Button>
              <Button type="primary" loading={importing} disabled={!validation} onClick={() => void startImport()}>确认并导入有效数据</Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card title="预校验结果" bordered={false} className="full-height-card">
            {!validation ? (
              <div className="validation-empty"><CloudUploadOutlined /><p>上传文件并执行预校验后<br />将在这里显示检查结果</p></div>
            ) : (
              <>
                <div className="validation-metrics">
                  <div><span>总行数</span><strong>{validation.total}</strong></div>
                  <div className="success-text"><span>有效</span><strong><CheckCircleFilled /> {validation.valid}</strong></div>
                  <div className="error-text"><span>异常</span><strong><WarningFilled /> {validation.invalid}</strong></div>
                </div>
                {validation.errors.length > 0 && <div className="validation-errors">
                  <Typography.Text strong>需要处理的问题</Typography.Text>
                  {validation.errors.map((error) => <div key={`${error.row}-${error.field}`}><Tag color="error">第 {error.row} 行</Tag><span><strong>{error.field}</strong>：{error.message}</span></div>)}
                  <Typography.Text type="secondary">导入时异常行会被跳过，并生成错误报告。</Typography.Text>
                </div>}
              </>
            )}
          </Card>
        </Col>
      </Row>
      <Card title="最近导入记录" bordered={false} className="dashboard-row" extra={<Button type="text" icon={<ReloadOutlined />} onClick={() => void loadJobs()}>刷新</Button>}>
        <Table rowKey="id" columns={columns} dataSource={jobs} loading={jobsLoading} scroll={{ x: 1100 }} pagination={{ pageSize: 8, showSizeChanger: false }} />
      </Card>
    </div>
  );
}
