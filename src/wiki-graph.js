/**
 * Wiki 依赖图签名（纯函数，无 Node 依赖）。
 *
 * Wiki 的生成输入不止卡片内容：模块页会列出模块内索引文件、依赖方向、
 * 循环与高风险入口，主题页 prompt 也带跨模块依赖摘要。卡片指纹只能覆盖
 * “有卡片文件的内容”，配置清单（tsconfig/jsconfig、composer PSR-4、
 * go.mod、pubspec、pyproject 等）驱动的边变化、以及新增/删除无卡片文件
 * 都不会改变卡片指纹。此签名把“索引文件集合 + 依赖边”规范化，供
 * generate 写入清单、status/verify-wiki/面板做陈检。
 *
 * 服务端与面板必须使用逐字节相同的文本，否则会出现“生成认为要重跑、
 * 门禁认为新鲜”的不一致。浏览器包不能引入宿主模块，client.js 内有同构
 * 副本（改动需同步）。
 */

/**
 * 构造索引结构签名文本（文件路径排序 + 边 from>to 排序）。
 * @param {{files?:Array<{path?:string}>, edges?:Array<{from?:string, to?:string}>}} [index]
 *   索引文档。
 * @returns {string} 规范化文本（调用方再做哈希）。
 */
export function wikiGraphText(index) {
  const files = []
  for (const file of Array.isArray(index?.files) ? index.files : []) {
    if (typeof file?.path === 'string' && file.path) files.push(file.path)
  }
  files.sort()
  const edges = []
  for (const edge of Array.isArray(index?.edges) ? index.edges : []) {
    if (typeof edge?.from === 'string' && typeof edge?.to === 'string') {
      edges.push(`${edge.from}>${edge.to}`)
    }
  }
  edges.sort()
  return `files:\n${files.join('\n')}\nedges:\n${edges.join('\n')}`
}
