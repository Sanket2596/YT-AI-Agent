export default {
    providers: [
      {
        domain: process.env.CLERK_ISSUE_URL,
        applicationID: "convex",
      },
    ]
  };