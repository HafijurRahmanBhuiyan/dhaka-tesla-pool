import { RideDetail } from "@/components/RideDetail";

export default async function RideDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RideDetail rideId={id} />;
}