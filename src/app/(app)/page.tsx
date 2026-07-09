import { Card, CardContent } from '@/components/ui/card'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">Os dados chegam na F1.</p>
        </CardContent>
      </Card>
    </div>
  )
}
