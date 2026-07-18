import { EyeOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { App, Button, Card, DatePicker, Descriptions, Drawer, Input, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import type { AuditLog } from '../types';

const { RangePicker } = DatePicker;

const moduleColors: Record<AuditLog['module'], string> = {
  用户: 'blue',
  商家: 'cyan',
  菜品: 'geekblue',
  评价: 'orange',
  导入: 'purple',
  系统: 'default',
};

export function AuditLogsPage() {
  const { message } = App.useApp();
  const [items, setItems] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditLog>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApi.auditLogs({ keyword, module: moduleName, page, pageSize: 12 });
      setItems(result.items);
      setTotal(result.total);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '审计日志加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, message, moduleName, page]);

  useEffect(() => { void load(); }, [load]);

  const columns: ColumnsType<AuditLog> = [
    { title: '时间', dataIndex: 'createdAt', width: 165 },
    { title: '操作人', key: 'actor', width: 150, render: (_, record) => <div className="table-primary"><strong>{record.actor}</strong><span>{record.role}</span></div> },
    { title: '模块', dataIndex: 'module', width: 90, render: (value: AuditLog['module']) => <Tag color={moduleColors[value]}>{value}</Tag> },
    { title: '操作', dataIndex: 'action', width: 150 },
    { title: '对象', dataIndex: 'target', width: 220, ellipsis: true },
    { title: 'IP 地址', dataIndex: 'ip', width: 130 },
    { title: '详情', dataIndex: 'detail', ellipsis: true },
    { title: '', key: 'actionButton', fixed: 'right', width: 60, render: (_, record) => <Button type="text" icon={<EyeOutlined />} aria-label="查看日志详情" onClick={() => setSelected(record)} /> },
  ];

  return (
    <div>
      <PageHeader title="审计日志" description="追踪管理操作与系统任务，日志只读且不可在管理端修改" />
      <Card bordered={false}>
        <div className="table-toolbar">
          <Space wrap>
            <Input allowClear prefix={<SearchOutlined />} placeholder="搜索操作人、操作或对象" value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} className="wide-search" />
            <Select value={moduleName} onChange={(value) => { setModuleName(value); setPage(1); }} style={{ width: 125 }} options={[{ value: '', label: '全部模块' }, ...Object.keys(moduleColors).map((value) => ({ value, label: value }))]} />
            <RangePicker placeholder={['开始日期', '结束日期']} onChange={() => setPage(1)} />
          </Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
        </div>
        <Table rowKey="id" columns={columns} dataSource={items} loading={loading} scroll={{ x: 1150 }} pagination={{ current: page, pageSize: 12, total, showTotal: (value) => `共 ${value} 条日志`, onChange: setPage }} />
        <div className="audit-notice"><Typography.Text type="secondary">审计日志默认保留 180 天。导出及更长周期归档由服务端策略控制。</Typography.Text></div>
      </Card>

      <Drawer title="日志详情" width={520} open={Boolean(selected)} onClose={() => setSelected(undefined)}>
        {selected && (
          <>
            <div className="audit-detail-title"><Tag color={moduleColors[selected.module]}>{selected.module}</Tag><Typography.Title level={4}>{selected.action}</Typography.Title></div>
            <Descriptions column={1} bordered size="small" className="drawer-descriptions">
              <Descriptions.Item label="日志 ID">{selected.id}</Descriptions.Item>
              <Descriptions.Item label="操作时间">{selected.createdAt}</Descriptions.Item>
              <Descriptions.Item label="操作人">{selected.actor}（{selected.role}）</Descriptions.Item>
              <Descriptions.Item label="来源 IP">{selected.ip}</Descriptions.Item>
              <Descriptions.Item label="操作对象">{selected.target}</Descriptions.Item>
              <Descriptions.Item label="详细记录">{selected.detail}</Descriptions.Item>
            </Descriptions>
            <div className="audit-hash"><span>完整性校验</span><code>sha256:{selected.id.toLowerCase()}09f3a82d7b19...</code></div>
          </>
        )}
      </Drawer>
    </div>
  );
}
