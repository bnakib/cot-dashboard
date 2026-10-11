import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('update_data', Path(__file__).parents[1] / 'scripts/update_data.py')
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)

def row(day='2023-01-03', large_long=40, large_short=20):
    # Synthetic balanced fixture, never shipped as real market data.
    return {'report_date_as_yyyy_mm_dd': day, 'cftc_contract_market_code': '067651',
            'market_and_exchange_names': 'CRUDE OIL, LIGHT SWEET - NEW YORK MERCANTILE EXCHANGE',
            'open_interest_all': '100', 'noncomm_positions_long_all': str(large_long),
            'noncomm_positions_short_all': str(large_short), 'noncomm_postions_spread_all': '10',
            'comm_positions_long_all': str(80-large_long), 'comm_positions_short_all': str(80-large_short),
            'nonrept_positions_long_all': '10', 'nonrept_positions_short_all': '10'}

class PipelineTests(unittest.TestCase):
    def test_net_and_weekly_change(self):
        market = pipeline.build([row('2023-01-10', 45, 18), row()])['067651']
        first, second = market['records']
        self.assertEqual(first['large']['net'], 20)
        self.assertIsNone(first['large']['change'])
        self.assertEqual(second['large']['change'], {'long': 5, 'short': -2, 'net': 7})
        self.assertEqual(second['commercial']['change']['net'], -7)
        self.assertEqual(second['gapDays'], 7)
    def test_missing_week_is_not_mislabeled(self):
        second = pipeline.build([row(), row('2023-01-17')])['067651']['records'][1]
        self.assertEqual(second['gapDays'], 14)
        self.assertEqual(second['previousDate'], '2023-01-03')
    def test_spreading_in_open_interest(self):
        record = pipeline.normalize(row())[2]
        self.assertEqual(sum(record[g]['long'] for g in pipeline.GROUPS) + record['spreading'], record['openInterest'])
    def test_invalid_total_fails(self):
        bad = row(); bad['open_interest_all'] = '99'
        with self.assertRaises(ValueError): pipeline.build([bad])
    def test_duplicate_conflict_fails(self):
        with self.assertRaises(ValueError): pipeline.build([row(), row(large_long=41)])
    def test_identical_duplicates_and_cutoff(self):
        market = pipeline.build([row(), copy.deepcopy(row()), row('2022-12-27')])['067651']
        self.assertEqual(len(market['records']), 1)
    def test_annual_csv_headers(self):
        api = row()
        labels = {
            'report_date_as_yyyy_mm_dd': 'As of Date in Form YYYY-MM-DD',
            'cftc_contract_market_code': 'CFTC Contract Market Code',
            'market_and_exchange_names': 'Market and Exchange Names',
            'open_interest_all': 'Open Interest (All)',
            'noncomm_positions_long_all': 'Noncommercial Positions-Long (All)',
            'noncomm_positions_short_all': 'Noncommercial Positions-Short (All)',
            'noncomm_postions_spread_all': 'Noncommercial Positions-Spreading (All)',
            'comm_positions_long_all': 'Commercial Positions-Long (All)',
            'comm_positions_short_all': 'Commercial Positions-Short (All)',
            'nonrept_positions_long_all': 'Nonreportable Positions-Long (All)',
            'nonrept_positions_short_all': 'Nonreportable Positions-Short (All)',
        }
        annual = {labels[k]: v for k, v in api.items()}
        self.assertEqual(pipeline.normalize(annual), pipeline.normalize(api))
        underscored = {k.replace(' ', '_'): v for k, v in annual.items()}
        self.assertEqual(pipeline.normalize(underscored), pipeline.normalize(api))
    def test_integral_decimal_counts(self):
        self.assertEqual(pipeline.number('1,000.0'), 1000)
        self.assertEqual(pipeline.number('0.00'), 0)
    def test_negative_and_fractional_counts_rejected(self):
        for value in ['-1', '1.5', '', 'oops']:
            with self.assertRaises(ValueError): pipeline.number(value)
    def test_no_change_does_not_rewrite(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'data'
            self.assertTrue(pipeline.publish(pipeline.build([row()]), target, 'test'))
            before = (target / 'index.json').read_text()
            self.assertFalse(pipeline.publish(pipeline.build([row()]), target, 'test'))
            self.assertEqual(before, (target / 'index.json').read_text())
    def test_empty_response_preserves_data(self):
        with self.assertRaises(ValueError): pipeline.build([])
    def test_regressing_history_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'data'
            pipeline.publish(pipeline.build([row(), row('2023-01-10')]), target, 'test')
            before = (target / 'index.json').read_text()
            with self.assertRaises(ValueError): pipeline.publish(pipeline.build([row()]), target, 'test')
            self.assertEqual(before, (target / 'index.json').read_text())

if __name__ == '__main__': unittest.main()
