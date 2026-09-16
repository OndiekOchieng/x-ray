import { InvestigationLibrary } from '@/components/investigations/investigation-library'
import { getLibraryEntries } from '@/lib/xray/investigations'

export default function LibraryPage() {
  return <InvestigationLibrary entries={getLibraryEntries()} />
}
