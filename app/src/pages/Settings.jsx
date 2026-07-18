import ProgramsSection from '../components/ProgramsSection.jsx'
import FixedCostsSection from '../components/FixedCostsSection.jsx'
import BillCyclesSection from '../components/BillCyclesSection.jsx'
import TargetSection from '../components/TargetSection.jsx'

export default function Settings() {
  return (
    <div>
      <ProgramsSection />
      <FixedCostsSection />
      <BillCyclesSection />
      <TargetSection />
    </div>
  )
}
