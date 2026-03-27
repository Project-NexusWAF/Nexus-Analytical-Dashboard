import { ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ApiErrorAlertProps {
  title: string;
  message: string;
  className?: string;
}

export function ApiErrorAlert({ title, message, className }: ApiErrorAlertProps) {
  return (
    <Alert variant="destructive" className={className}>
      <ShieldAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
