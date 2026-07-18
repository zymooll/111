import { Tag } from 'antd';
import type { EntityStatus, ImportJob, PublishStatus, ReviewStatus } from '../types';

type Status = EntityStatus | PublishStatus | ReviewStatus | ImportJob['status'];

const statusMap: Record<Status, { color: string; label: string }> = {
  active: { color: 'success', label: '正常' },
  frozen: { color: 'error', label: '已冻结' },
  unverified: { color: 'default', label: '待验证' },
  online: { color: 'success', label: '已上架' },
  offline: { color: 'default', label: '已下架' },
  draft: { color: 'processing', label: '草稿' },
  pending_machine: { color: 'processing', label: '机器审核中' },
  pending_manual: { color: 'warning', label: '待人工审核' },
  published: { color: 'success', label: '已发布' },
  rejected: { color: 'error', label: '已驳回' },
  hidden: { color: 'default', label: '已隐藏' },
  validating: { color: 'processing', label: '校验中' },
  processing: { color: 'processing', label: '导入中' },
  completed: { color: 'success', label: '已完成' },
  failed: { color: 'error', label: '失败' },
};

export function StatusTag({ status }: { status: Status }) {
  const config = statusMap[status];
  return <Tag color={config.color}>{config.label}</Tag>;
}
