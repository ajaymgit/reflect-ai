import { Link } from "react-router-dom";
import { Button, Card, PageHeader } from "../ui";

export default function NotFoundPage() {
  return (
    <main className="p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader
          eyebrow="Page not found"
          title="This reflection space does not exist"
          description="The link may be old, or the page may have moved. Head back to your ReflectAI home to continue."
        />
        <Card>
          <Link to="/dashboard">
            <Button>Return home</Button>
          </Link>
        </Card>
      </div>
    </main>
  );
}
