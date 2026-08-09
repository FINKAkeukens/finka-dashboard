export default function ComingSoonTab({ moduleName }: { moduleName: string }) {
  return (
    <div className="bg-white rounded-xl border border-dashed border-[#DDD8D2] py-16 text-center">
      <p className="text-sm text-[#6B6560]">
        {moduleName} wordt in een volgende bouwstap toegevoegd.
      </p>
    </div>
  )
}
