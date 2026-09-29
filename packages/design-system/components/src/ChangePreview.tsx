export function ChangePreview({
  path,
  before,
  after,
  language = 'zh',
}: {
  path: string
  before: string | null
  after: string
  language?: 'zh' | 'en'
}) {
  const old = (before || '').split('\n'),
    next = after.split('\n')
  let prefix = 0,
    suffix = 0
  while (prefix < old.length && prefix < next.length && old[prefix] === next[prefix]) prefix++
  while (
    suffix < old.length - prefix &&
    suffix < next.length - prefix &&
    old[old.length - 1 - suffix] === next[next.length - 1 - suffix]
  )
    suffix++
  return (
    <section className="catea-ui catea-change">
      <strong>{path}</strong>
      <p>
        {before === null
          ? language === 'en'
            ? 'Create file'
            : '新建文件'
          : language === 'en'
            ? 'Edit file'
            : '修改文件'}{' '}
        · -{old.length - prefix - suffix} / +{next.length - prefix - suffix}
      </p>
      <pre>
        {prefix > 0 && (
          <span>
            … {prefix} {language === 'en' ? 'unchanged lines' : '行未改动'}
            {'\n'}
          </span>
        )}
        {old.slice(prefix, old.length - suffix).map((line, i) => (
          <span className="catea-change__removed" key={`old-${i}`}>
            − {line}
            {'\n'}
          </span>
        ))}
        {next.slice(prefix, next.length - suffix).map((line, i) => (
          <span className="catea-change__added" key={`new-${i}`}>
            + {line}
            {'\n'}
          </span>
        ))}
        {suffix > 0 && (
          <span>
            … {suffix} {language === 'en' ? 'unchanged lines' : '行未改动'}
          </span>
        )}
      </pre>
    </section>
  )
}
