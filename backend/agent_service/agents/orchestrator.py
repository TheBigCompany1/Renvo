from agents.text_agent import TextAnalysisAgent
from agents.comp_agent import CompAnalysisAgent
from agents.image_agent import ImageAnalysisAgent
from agents.financial_agent import FinancialAnalysisAgent
from agents.contractor_agent import ContractorSearchAgent
from agents.report_writer_agent import ReportWriterAgent
from models.property import Property
from models.report import FullReport

class OrchestratorAgent:
    def __init__(self, llm):
        self.text_agent = TextAnalysisAgent(llm)
        self.comp_agent = CompAnalysisAgent(llm)
        self.image_agent = ImageAnalysisAgent(llm)
        self.financial_agent = FinancialAnalysisAgent(llm)
        self.contractor_agent = ContractorSearchAgent(llm)
        self.report_writer_agent = ReportWriterAgent(llm)

    def generate_full_report(self, property_data: Property) -> FullReport:
        print("\n--- generate_full_report started with new agent team ---\n")
        try:
            # 1. Text Analysis Agent
            print("[Orchestrator] Calling TextAnalysisAgent...")
            renovation_ideas = self.text_agent.process(property_data)
            if not renovation_ideas:
                raise ValueError("Text analysis failed to produce renovation ideas.")

            # 2. Comp Analysis Agent
            print("[Orchestrator] Calling CompAnalysisAgent...")
            comps = self.comp_agent.process(property_data, mode='strict')
            print(f"[Orchestrator] Found {len(comps)} comps.")

            # 3. Image Analysis Agent
            print("[Orchestrator] Calling ImageAnalysisAgent...")
            image_analysis_results = self.image_agent.process(property_data, renovation_ideas)
            # Use the refined ideas from the image agent if available
            processed_ideas = image_analysis_results if image_analysis_results else renovation_ideas

            # 4. Financial Analysis Agent
            print("[Orchestrator] Calling FinancialAnalysisAgent...")
            # --- DEFINITIVE FIX: Pass the 'comps' data to the financial agent ---
            financial_analysis_results = self.financial_agent.process(property_data, processed_ideas, comps)
            if not financial_analysis_results:
                 # It's not a critical failure if financials can't be run, just a warning.
                 print("[Orchestrator] WARNING: Financial analysis did not return results. Proceeding without financial data.")
                 # Use the ideas from the image agent as the final list
                 final_ideas = processed_ideas
            else:
                final_ideas = financial_analysis_results


            # 5. Contractor Search Agent (for the top idea)
            top_idea = final_ideas[0] if final_ideas else None
            contractors = []
            if top_idea:
                print(f"[Orchestrator] Calling ContractorSearchAgent for top idea: {top_idea.name}")
                contractors = self.contractor_agent.process(property_data, top_idea.name)
            
            # 6. Report Writer Agent
            print("[Orchestrator] Calling ReportWriterAgent...")
            summary = self.report_writer_agent.process(property_data, final_ideas, comps, contractors)

            # 7. Compile the final report
            print("[Orchestrator] Compiling final report...")
            full_report = FullReport(
                property_details=property_data,
                renovation_projects=final_ideas,
                comparable_properties=comps,
                local_contractors=contractors,
                market_summary=summary
            )

            print("\n--- generate_full_report finished ---\n")
            return full_report

        except Exception as e:
            print(f"\n--- [Orchestrator] A CRITICAL error occurred: {e} ---\n")
            # In case of a failure, we still want to create a partial report if possible
            # For simplicity in this version, we'll re-raise the error.
            # A more robust implementation could return a report with an error message.
            raise e

