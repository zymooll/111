import { EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { App, Button, Card, Descriptions, Drawer, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useState } from 'react';
import { adminApi } from '../api/client';
import { CursorPagination } from '../components/CursorPagination';
import { PageHeader } from '../components/PageHeader';
import { useCursorList } from '../hooks/useCursorList';
import type { AuditLog, CursorQuery } from '../types';

const targetTypeLabels: Record<string, { label: string; color: string }> = {
  user: { label: '用户', color: 'blue' },
  merchant: { label: '商家', color: 'cyan' },
  menu_item: { label: '菜品', color: 'geekblue' },
  category: { label: '品类', color: 'gold' },
  area: { label: '校园地点', color: 'lime' },
  tag: { label: '标签', color: 'green' },
  review: { label: '评价', color: 'orange' },
  import: { label: '导入', color: 'purple' },
};

const pageSize = 12;

function TargetTypeTag({ value }: { value: string }) {
  const config = targetTypeLabels[value];
  return <Tag color={config?.color ?? 'default'}>{config?.label ?? (value || '—')}</Tag>;
}

export function AuditLogsPage() {
  const { message } = App.useApp();
  const [selected, setSelected] = useState<AuditLog>();

  const handleError = useCallback((error: unknown) => {
    message.error(error instanceof Error ? error.message : '审计日志加载失败');
  }, [message]);

  const loadPage = useCallback(
    (query: CursorQuery, signal: AbortSignal) => adminApi.auditLogs(query, signal),
    [],
  );

  const list = useCursorList(loadPage, pageSize, handleError);

  const columns: ColumnsType<AuditLog> = [
    { title: '时间', dataIndex: 'createdAt', width: 165 },
    { title: '操作管理员 ID', dataIndex: 'actorId', width: 200, ellipsis: true },
    { title: '对象类型', dataIndex: 'targetType', width: 110, render: (value: string) => <TargetTypeTag value={value} /> },
    { title: '操作', dataIndex: 'action', width: 190 },
    { title: '对象 ID', dataIndex: 'target', width: 220, ellipsis: true },
    { title: '详情', dataIndex: 'detail', ellipsis: true },
    { title: '', key: 'actionButton', fixed: 'right', width: 60, render: (_, record) => <Button type="text" icon={<EyeOutlined />} aria-label="查看日志详情" onClick={() => setSelected(record)} /> },
  ];

  return (
    <div>
      <PageHeader title="审计日志" description="追踪管理操作与系统任务，日志只读且不可在管理端修改" />
      <Card bordered={false}>
        <div className="table-toolbar">
          <Typography.Text type="secondary">日志按时间倒序分页展示；服务端未提供关键词、对象类型或时间范围检索能力。</Typography.Text>
          <Button icon={<ReloadOutlined />} onClick={list.reload}>刷新</Button>
        </div>
        <Table rowKey="id" columns={columns} dataSource={list.items} loading={list.loading} scroll={{ x: 1150 }} pagination={false} />
        <CursorPagination list={list} />
        <div className="audit-notice"><Typography.Text type="secondary">审计日志默认保留 180 天。导出及更长周期归档由服务端策略控制。</Typography.Text></div>
      </Card>

      <Drawer title="日志详情" width={520} open={Boolean(selected)} onClose={() => setSelected(undefined)}>
        {selected && (
          <>
            <div className="audit-detail-title"><TargetTypeTag value={selected.targetType} /><Typography.Title level={4}>{selected.action}</Typography.Title></div>
            <Descriptions column={1} bordered size="small" className="drawer-descriptions">
              <Descriptions.Item label="日志 ID">{selected.id}</Descriptions.Item>
              <Descriptions.Item label="操作时间">{selected.createdAt}</Descriptions.Item>
              <Descriptions.Item label="操作管理员 ID">{selected.actorId}</Descriptions.Item>
              <Descriptions.Item label="操作对象 ID">{selected.target}</Descriptions.Item>
              <Descriptions.Item label="详细记录"><pre className="audit-detail-json">{selected.detail}</pre></Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Drawer>
    </div>
  );
}
